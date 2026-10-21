//! Bazaars in every state, played through with the real functions: a kids' bazaar
//! running right now, an upcoming ski bazaar, a flea market that just ended and one long
//! ago, an event waiting for approval, a rejected one, a full one and a spam event an
//! admin hid. Around them: helpers, a walk-in seller, discounts, offers in every state,
//! questions, messages to sellers, payouts, reports and contact messages.

use std::collections::HashMap;

use anyhow::{Context, anyhow};
use chrono::{DateTime, Duration, NaiveTime, TimeZone, Utc};
use chrono_tz::Europe::Berlin;
use serde_json::{Value, json};
use uuid::Uuid;

use super::catalog::{
    self, BOOKS, BUYERS, Cat, GENERAL, HELPERS, INACTIVE, Item, KIDS, ORGANIZERS, Person, SELLERS,
    SKI, SPAMMER, STREETS, Text, UNVERIFIED, WALK_IN, t,
};
use super::core::CoreUsers;
use super::{Seeder, UserSpec};
use crate::config::InstanceMode;
use crate::i18n::Locale;
use crate::rpc::Ctx;

pub const KIDS_TITLE: Text = t(
    "Kinderbasar Kita Sonnenschein",
    "Sunshine Nursery Kids' Bazaar",
);

/// Small deterministic random numbers, so every seed looks the same.
struct Dice(u64);

impl Dice {
    fn next(&mut self) -> u64 {
        // xorshift64*
        self.0 ^= self.0 >> 12;
        self.0 ^= self.0 << 25;
        self.0 ^= self.0 >> 27;
        self.0.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    fn chance(&mut self, percent: u64) -> bool {
        self.next() % 100 < percent
    }

    fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }
}

fn ascii(name: &str) -> String {
    name.to_lowercase()
        .replace('ä', "ae")
        .replace('ö', "oe")
        .replace('ü', "ue")
        .replace('ß', "ss")
        .replace('ı', "i")
        .chars()
        .filter(char::is_ascii_alphanumeric)
        .collect()
}

/// A day relative to today at a time in Berlin.
fn berlin(now: DateTime<Utc>, days: i64, hour: u32, minute: u32) -> DateTime<Utc> {
    let date = now.with_timezone(&Berlin).date_naive() + Duration::days(days);
    let time = NaiveTime::from_hms_opt(hour, minute, 0).expect("valid time");
    Berlin
        .from_local_datetime(&date.and_time(time))
        .earliest()
        .expect("time exists in Berlin")
        .with_timezone(&Utc)
}

fn millis(time: DateTime<Utc>) -> i64 {
    time.timestamp_millis()
}

/// A listed item of a seller: product, its listing in the event, the catalog entry.
#[derive(Clone, Copy)]
struct Listed {
    product: Uuid,
    relation: Uuid,
    seller: Uuid,
    item: &'static Item,
}

/// When sellers hand in and pick up their items (from, until)
struct Logistics {
    dropoff: (DateTime<Utc>, DateTime<Utc>),
    pickup: (DateTime<Utc>, DateTime<Utc>),
    note: Text,
}

struct People {
    organizers: Vec<Uuid>,
    helpers: Vec<Uuid>,
    sellers: Vec<Uuid>,
    buyers: Vec<Uuid>,
    spammer: Uuid,
    emails: HashMap<Uuid, String>,
}

struct Demo<'a> {
    seeder: &'a Seeder,
    ctx: &'a mut Ctx,
    admin: Uuid,
    dice: Dice,
    single: bool,
}

struct EventPlan {
    organizer: Uuid,
    title: Text,
    description: Text,
    location: Text,
    contact: &'static str,
    services: &'static [&'static str],
    visibility: &'static str,
    access_code: Option<&'static str>,
    vendor_limit: Option<i32>,
    commission: f64,
    categories: &'static [Cat],
    cover: &'static str,
    features: Value,
}

impl Demo<'_> {
    fn text(&self, text: Text) -> &'static str {
        self.seeder.text(text)
    }

    async fn call(&mut self, user: Uuid, name: &str, args: Value) -> anyhow::Result<Value> {
        self.ctx
            .call(Some(user), name, args.clone())
            .await
            .map_err(|err| anyhow!("{name}({args}): {err}"))
    }

    async fn id(&mut self, user: Uuid, name: &str, args: Value) -> anyhow::Result<Uuid> {
        let value = self.call(user, name, args).await?;
        serde_json::from_value(value).with_context(|| format!("{name} returned no ID"))
    }

    async fn person(
        &mut self,
        person: &Person,
        index: usize,
        status: &str,
        verified: bool,
    ) -> anyhow::Result<(Uuid, String)> {
        let locale = self.seeder.locale;
        let first = person.first.get(locale);
        let last = person.last.get(locale);
        let email = format!("{}.{}@example.org", ascii(first), ascii(last));
        let city = catalog::city(locale, index);
        let street = STREETS[index % STREETS.len()].get(locale);
        let street = match locale {
            Locale::De => format!("{street} {}", 3 + index * 7 % 60),
            Locale::En => format!("{} {street}", 3 + index * 7 % 60),
        };
        let phone = match locale {
            Locale::De => format!("0151 {:07}", 4_200_000 + index * 13_579),
            Locale::En => format!("07700 {:06}", 900_000 + index * 1_357),
        };
        let name = format!("{first} {last}");
        let days_ago = 20 + self.dice.below(400) as i64;
        let id = self
            .seeder
            .ensure_user(
                self.ctx,
                &UserSpec {
                    first_name: Some(first),
                    last_name: Some(last),
                    status,
                    verified,
                    street: Some(street),
                    zip_code: Some(city.zip),
                    city: Some(city.name),
                    country: Some(city.country),
                    phone: Some(phone),
                    locale: Some(locale),
                    days_ago,
                    ..UserSpec::simple(&email, &name)
                },
            )
            .await?;
        Ok((id, email))
    }

    async fn people(&mut self) -> anyhow::Result<People> {
        let mut emails = HashMap::new();
        let mut index = 0;
        let mut group = async |demo: &mut Self, list: &[Person]| -> anyhow::Result<Vec<Uuid>> {
            let mut ids = Vec::new();
            for person in list {
                let (id, email) = demo.person(person, index, "active", true).await?;
                index += 1;
                emails.insert(id, email);
                ids.push(id);
            }
            Ok(ids)
        };
        let organizers = group(self, &ORGANIZERS).await?;
        let helpers = group(self, &HELPERS).await?;
        let sellers = group(self, &SELLERS).await?;
        let buyers = group(self, &BUYERS).await?;
        let spammer = group(self, std::slice::from_ref(&SPAMMER)).await?[0];
        self.person(&INACTIVE, 90, "inactive", true).await?;
        self.person(&UNVERIFIED, 91, "notVerified", false).await?;
        Ok(People {
            organizers,
            helpers,
            sellers,
            buyers,
            spammer,
            emails,
        })
    }

    /// Creates the event as its organizer, running from three hours ago, so every step of
    /// the play-through is allowed; `finish` moves it to its real dates.
    async fn create_event(&mut self, plan: &EventPlan, approve: bool) -> anyhow::Result<Uuid> {
        let now = self.seeder.now;
        let categories: Vec<Uuid> = plan
            .categories
            .iter()
            .map(|cat| self.seeder.category(*cat))
            .collect();
        let mut args = json!({
            "title": self.text(plan.title),
            "description": self.text(plan.description),
            "location": self.text(plan.location),
            "startDate": millis(now - Duration::hours(3)),
            "endDate": millis(now + Duration::hours(8)),
            "contactInfo": plan.contact,
            "categories": categories,
            "services": plan.services,
            "visibility": plan.visibility,
            "commission": plan.commission,
            "features": plan.features,
        });
        if let Some(cover) = self.seeder.image(plan.cover) {
            args["coverImage"] = json!(cover);
        }
        if let Some(code) = plan.access_code {
            args["accessCode"] = json!(code);
        }
        if let Some(limit) = plan.vendor_limit {
            args["vendorLimit"] = json!(limit);
        }
        // Only admins create events on a single-association instance
        let creator = if self.single {
            self.admin
        } else {
            plan.organizer
        };
        let event = self.id(creator, "events.createEvent", args).await?;
        if creator != plan.organizer {
            sqlx::query("UPDATE events SET organizer_id = $2 WHERE id = $1")
                .bind(event)
                .bind(plan.organizer)
                .execute(self.ctx.conn())
                .await?;
            sqlx::query(
                "UPDATE event_roles SET user_id = $2 WHERE event_id = $1 AND role = 'organizer'",
            )
            .bind(event)
            .bind(plan.organizer)
            .execute(self.ctx.conn())
            .await?;
        }
        if approve && self.is_pending(event).await? {
            let admin = self.admin;
            self.call(
                admin,
                "events.approveEventForAdmin",
                json!({ "eventId": event }),
            )
            .await?;
        }
        Ok(event)
    }

    async fn is_pending(&mut self, event: Uuid) -> anyhow::Result<bool> {
        let status: Option<String> =
            sqlx::query_scalar("SELECT approval_status::text FROM events WHERE id = $1")
                .bind(event)
                .fetch_one(self.ctx.conn())
                .await?;
        Ok(status.as_deref() == Some("pending"))
    }

    /// Helpers are picked from the participants, so they join first.
    async fn helper(
        &mut self,
        organizer: Uuid,
        event: Uuid,
        user: Uuid,
        code: Option<&str>,
    ) -> anyhow::Result<()> {
        self.join(user, event, code).await?;
        self.call(
            organizer,
            "eventRoles.addCoOrganizerForEvent",
            json!({ "eventId": event, "userId": user }),
        )
        .await?;
        Ok(())
    }

    async fn join(&mut self, user: Uuid, event: Uuid, code: Option<&str>) -> anyhow::Result<()> {
        self.call(
            user,
            "eventSeller.joinEvent",
            json!({ "eventId": event, "accessCode": code, "privateSeller": true }),
        )
        .await?;
        Ok(())
    }

    /// The seller creates the items and registers them for the event (announced).
    async fn bring(
        &mut self,
        seller: Uuid,
        event: Uuid,
        items: &[&'static Item],
        offers: bool,
    ) -> anyhow::Result<Vec<Listed>> {
        let mut listed = Vec::new();
        for item in items {
            let locale = self.seeder.locale;
            let attributes: serde_json::Map<String, Value> = item
                .attrs
                .iter()
                .map(|(key, de, en)| {
                    let value = match locale {
                        Locale::De => de,
                        Locale::En => en,
                    };
                    ((*key).to_owned(), Value::from(*value))
                })
                .collect();
            let photo = item.image.unwrap_or(item.cat.photo());
            let images: Vec<Uuid> = self.seeder.image(photo).into_iter().collect();
            let mut args = json!({
                "title": self.text(item.title),
                "vendorId": seller,
                "description": self.text(item.description),
                "condition": item.condition,
                "images": images,
                "productCategory": self.seeder.category(item.cat),
                "price": item.price,
                "readyForSale": true,
                "sold": false,
                "attributes": attributes,
            });
            if offers && item.price >= 15.0 {
                args["acceptsOffers"] = json!(true);
            }
            if let Some(minimum) = item.minimum_price {
                args["minimumPrice"] = json!(minimum);
            }
            let product = self.id(seller, "products.addProduct", args).await?;
            let relation = self
                .id(
                    seller,
                    "eventProducts.addProductToEvent",
                    json!({ "eventId": event, "productId": product }),
                )
                .await?;
            listed.push(Listed {
                product,
                relation,
                seller,
                item,
            });
        }
        Ok(listed)
    }

    async fn check_in(
        &mut self,
        staff: Uuid,
        listed: &Listed,
        location: Option<Uuid>,
    ) -> anyhow::Result<()> {
        self.call(
            staff,
            "eventProducts.updateProductStatus",
            json!({ "eventProductId": listed.relation, "status": "available", "locationCategoryId": location }),
        )
        .await?;
        Ok(())
    }

    async fn sell(
        &mut self,
        cashier: Uuid,
        cart: &[Value],
        buyer_email: Option<&str>,
    ) -> anyhow::Result<()> {
        self.call(
            cashier,
            "purchases.sellProducts",
            json!({ "items": cart, "buyerEmail": buyer_email }),
        )
        .await?;
        Ok(())
    }

    async fn offer(
        &mut self,
        buyer: Uuid,
        listed: &Listed,
        percent: f64,
        message: Option<&str>,
    ) -> anyhow::Result<Uuid> {
        let amount = (listed.item.price * percent / 100.0).floor();
        self.id(
            buyer,
            "offers.makeOffer",
            json!({ "productId": listed.product, "amount": amount, "message": message }),
        )
        .await
    }

    async fn respond(&mut self, listed: &Listed, offer: Uuid, accept: bool) -> anyhow::Result<()> {
        self.call(
            listed.seller,
            "offers.respondToOffer",
            json!({ "offerId": offer, "accept": accept }),
        )
        .await?;
        Ok(())
    }

    async fn ask(&mut self, buyer: Uuid, listed: &Listed, question: Text) -> anyhow::Result<Uuid> {
        let question = self.text(question);
        self.id(
            buyer,
            "productQuestions.ask",
            json!({ "productId": listed.product, "question": question }),
        )
        .await
    }

    async fn answer(
        &mut self,
        listed: &Listed,
        question: Uuid,
        answer: Text,
    ) -> anyhow::Result<()> {
        let answer = self.text(answer);
        self.call(
            listed.seller,
            "productQuestions.answer",
            json!({ "questionId": question, "answer": answer }),
        )
        .await?;
        Ok(())
    }

    async fn broadcast(
        &mut self,
        organizer: Uuid,
        event: Uuid,
        subject: Text,
        body: Text,
        audience: &str,
        important: bool,
    ) -> anyhow::Result<()> {
        let (subject, body) = (self.text(subject), self.text(body));
        self.call(
            organizer,
            "broadcasts.sendSellerBroadcast",
            json!({ "eventId": event, "subject": subject, "body": body, "audience": audience, "important": important }),
        )
        .await?;
        Ok(())
    }

    async fn report(
        &mut self,
        reporter: Uuid,
        target_type: &str,
        target: Uuid,
        reason: &str,
        details: Text,
    ) -> anyhow::Result<Uuid> {
        let details = self.text(details);
        self.call(
            reporter,
            "moderation.reportContent",
            json!({ "targetType": target_type, "targetId": target.to_string(), "reason": reason, "details": details }),
        )
        .await?;
        Ok(sqlx::query_scalar(
            "SELECT id FROM reports WHERE reporter_id = $1 AND target_id = $2 ORDER BY created_at DESC LIMIT 1",
        )
        .bind(reporter)
        .bind(target)
        .fetch_one(self.ctx.conn())
        .await?)
    }

    /// Items for a seller: `count` entries of the list, starting at an offset per seller.
    fn pick(list: &'static [Item], seller_index: usize, count: usize) -> Vec<&'static Item> {
        (0..count.min(list.len()))
            .map(|i| &list[(seller_index * 5 + i * 3) % list.len()])
            .collect::<Vec<_>>()
            .into_iter()
            .fold(Vec::new(), |mut picked, item| {
                if !picked.iter().any(|p: &&Item| std::ptr::eq(*p, item)) {
                    picked.push(item);
                }
                picked
            })
    }

    /// Moves an event to its real dates and spreads the times of what happened in it.
    async fn finish(
        &mut self,
        event: Uuid,
        start: DateTime<Utc>,
        end: DateTime<Utc>,
        logistics: Option<Logistics>,
    ) -> anyhow::Result<()> {
        let now = self.seeder.now;
        let (dropoff_start, dropoff_end, pickup_start, pickup_end, note) = match logistics {
            Some(l) => (
                Some(l.dropoff.0),
                Some(l.dropoff.1),
                Some(l.pickup.0),
                Some(l.pickup.1),
                Some(self.text(l.note)),
            ),
            None => (None, None, None, None, None),
        };
        sqlx::query(
            "UPDATE events SET start_date = $2, end_date = $3,
               dropoff_start = $4, dropoff_end = $5, pickup_start = $6, pickup_end = $7, logistics_note = $8,
               features = CASE WHEN features ? 'discountStartsAt'
                 THEN jsonb_set(features, '{discountStartsAt}',
                   to_jsonb((extract(epoch FROM least($2 + ($3 - $2) / 2, $9::timestamptz - interval '30 minutes')) * 1000)::bigint))
                 ELSE features END,
               created_at = least($2, $9::timestamptz) - interval '45 days',
               approved_at = CASE WHEN approved_at IS NULL THEN NULL ELSE least($2, $9::timestamptz) - interval '44 days' END
             WHERE id = $1",
        )
        .bind(event)
        .bind(start)
        .bind(end)
        .bind(dropoff_start)
        .bind(dropoff_end)
        .bind(pickup_start)
        .bind(pickup_end)
        .bind(note)
        .bind(now)
        .execute(self.ctx.conn())
        .await?;
        // Registration in the weeks before; sales, offers and questions during the event
        let sold_until = end.min(now);
        let statements = [
            "UPDATE event_sellers SET created_at = $2 - interval '40 days' + random() * interval '35 days' WHERE event_id = $1",
            "UPDATE event_products SET created_at = $2 - interval '30 days' + random() * interval '28 days' WHERE event_id = $1",
            "UPDATE products p SET created_at = ep.created_at, updated_at = ep.created_at
               FROM event_products ep WHERE ep.product_id = p.id AND ep.event_id = $1",
            "UPDATE purchases SET created_at = $2 + random() * ($3 - $2) WHERE event_id = $1",
            "UPDATE purchases SET payout_date = $3 + interval '30 minutes' + random() * interval '90 minutes'
               WHERE event_id = $1 AND payout_status",
            "UPDATE product_offers SET created_at = $2 + random() * ($3 - $2) * 0.6 WHERE event_id = $1",
            "UPDATE product_offers SET responded_at = created_at + interval '12 minutes' WHERE event_id = $1 AND responded_at IS NOT NULL",
            "UPDATE product_questions SET created_at = $2 - interval '6 days' + random() * interval '5 days' WHERE event_id = $1",
            "UPDATE product_questions SET answered_at = created_at + interval '3 hours' WHERE event_id = $1 AND answered_at IS NOT NULL",
            "UPDATE unread_notices SET created_at = $2 + random() * ($3 - $2) WHERE event_id = $1",
        ];
        for statement in statements {
            sqlx::query(sqlx::AssertSqlSafe(statement))
                .bind(event)
                .bind(start.min(now))
                .bind(sold_until.max(start.min(now)))
                .execute(self.ctx.conn())
                .await?;
        }
        Ok(())
    }

    async fn location(
        &mut self,
        organizer: Uuid,
        event: Uuid,
        label: Text,
    ) -> anyhow::Result<Uuid> {
        let label = self.text(label);
        self.id(
            organizer,
            "eventLocationCategories.createCategory",
            json!({ "eventId": event, "label": label }),
        )
        .await
    }
}

pub async fn insert(seeder: &Seeder, ctx: &mut Ctx, core: &CoreUsers) -> anyhow::Result<()> {
    let single = ctx.state.config.mode == InstanceMode::Single;
    let mut demo = Demo {
        seeder,
        ctx,
        admin: core.admin,
        dice: Dice(0x5EED_BA2A_A2B0),
        single,
    };
    let people = demo.people().await?;
    kids_bazaar(&mut demo, &people)
        .await
        .context("kids' bazaar")?;
    ski_bazaar(&mut demo, &people).await.context("ski bazaar")?;
    flea_market(&mut demo, &people)
        .await
        .context("flea market")?;
    book_market(&mut demo, &people)
        .await
        .context("book market")?;
    other_events(&mut demo, &people)
        .await
        .context("other events")?;
    contact_messages(&mut demo)
        .await
        .context("contact messages")?;
    // Offers of the bazaars that are over close like after a real event
    let admin = demo.admin;
    loop {
        let result = demo
            .ctx
            .call(Some(admin), "offers.expireOffersOfEndedEvents", json!({}))
            .await;
        let more = result.map_err(|err| anyhow!("{err}"))?["more"]
            .as_bool()
            .unwrap_or(false);
        if !more {
            break;
        }
    }
    Ok(())
}

/// Running right now: check-in done, the cash desk busy, discounts since noon.
async fn kids_bazaar(demo: &mut Demo<'_>, people: &People) -> anyhow::Result<()> {
    let now = demo.seeder.now;
    let organizer = people.organizers[0];
    let [lena, paul, _] = [people.helpers[0], people.helpers[1], people.helpers[2]];
    let event = demo
        .create_event(
            &EventPlan {
                organizer,
                title: KIDS_TITLE,
                description: t(
                    "Second-Hand-Basar für Kinderkleidung, Spielzeug, Bücher und Kinderwagen. Der Elternbeirat organisiert, 15 % gehen an die Kita-Kasse. Mit Kuchenbuffet!\n\nAbgabe am Vortag, Abholung der nicht verkauften Sachen ab 15 Uhr.",
                    "Second-hand bazaar for children's clothes, toys, books and prams. Run by the parents' council, 15 % go to the nursery. With a cake buffet!\n\nDrop-off the day before, unsold items can be picked up from 3 pm.",
                ),
                location: t(
                    "Kita Sonnenschein, Turnraum, Lindenstraße 4, Ulm",
                    "Sunshine Nursery, gym, 4 Linden Street, Oxford",
                ),
                contact: "elternbeirat@example.org",
                services: &["Imbiss", "Getränke"],
                visibility: "public",
                access_code: None,
                vendor_limit: Some(60),
                commission: 15.0,
                categories: &[Cat::Clothing, Cat::Shoes, Cat::Toys, Cat::Books, Cat::Other],
                cover: "cover_clothes",
                features: json!({
                    "discounts": true,
                    "discountStartsAt": millis(now - Duration::minutes(30)),
                    "maxDiscountPercent": 50,
                    "priceOffers": true,
                    "minimumPrice": true,
                    "questions": true,
                    "labelFormat": "small",
                    "intakeFee": 0.5,
                    "privateSellersOnly": true,
                    "fixedSellerData": true,
                    "maxItemsPerSeller": 40,
                }),
            },
            true,
        )
        .await?;
    demo.helper(organizer, event, lena, None).await?;
    demo.helper(organizer, event, paul, None).await?;
    let clothes = demo
        .location(organizer, event, t("Kleidung & Schuhe", "Clothes & shoes"))
        .await?;
    let toys = demo
        .location(organizer, event, t("Spielzeug & Bücher", "Toys & books"))
        .await?;
    let large = demo
        .location(organizer, event, t("Großteile", "Large items"))
        .await?;

    let mut all = Vec::new();
    for (index, seller) in people.sellers[..12].iter().copied().enumerate() {
        demo.join(seller, event, None).await?;
        let listed = demo
            .bring(seller, event, &Demo::pick(KIDS, index, 6), true)
            .await?;
        for (n, item) in listed.iter().enumerate() {
            // Every third seller still has an item to hand in
            if index % 3 == 2 && n == listed.len() - 1 {
                continue;
            }
            let location = match item.item.cat {
                Cat::Clothing | Cat::Shoes => clothes,
                Cat::Toys | Cat::Books => toys,
                _ => large,
            };
            let staff = if n % 2 == 0 { lena } else { paul };
            demo.check_in(staff, item, Some(location)).await?;
            all.push(*item);
        }
    }
    let first = all[0];
    demo.call(
        lena,
        "eventProducts.setEventProductNote",
        json!({ "eventProductId": first.relation, "note": demo.text(t("Hängt an Stange 3", "On rail 3")) }),
    )
    .await?;
    // Discounts the sellers set since noon
    for (index, listed) in all.iter().enumerate().filter(|(i, _)| i % 7 == 3) {
        let percent = [10, 20, 30, 50][index % 4];
        demo.call(
            listed.seller,
            "eventProducts.updateProductDiscount",
            json!({ "eventId": event, "productId": listed.product, "discountPercent": percent }),
        )
        .await?;
    }

    // Offers in every state
    let offerable: Vec<Listed> = all
        .iter()
        .copied()
        .filter(|l| l.item.price >= 15.0)
        .collect();
    let [b0, b1, b2, b3, b4, b5] = [0, 1, 2, 3, 4, 5].map(|i| people.buyers[i]);
    let message = t(
        "Ich komme gegen 13 Uhr vorbei.",
        "I'll drop by around 1 pm.",
    );
    demo.offer(b0, &offerable[0], 80.0, Some(demo.text(message)))
        .await?;
    let redeemed = demo.offer(b1, &offerable[1], 85.0, None).await?;
    demo.respond(&offerable[1], redeemed, true).await?;
    let waiting = demo.offer(b2, &offerable[2], 90.0, None).await?;
    demo.respond(&offerable[2], waiting, true).await?;
    let rejected = demo.offer(b3, &offerable[3], 50.0, None).await?;
    demo.respond(&offerable[3], rejected, false).await?;
    let withdrawn = demo.offer(b4, &offerable[4], 75.0, None).await?;
    demo.call(b4, "offers.withdrawOffer", json!({ "offerId": withdrawn }))
        .await?;

    // Questions to the sellers, some answered
    let questions = [
        (
            t(
                "Ist die Größe eher klein oder groß geschnitten?",
                "Does it run small or large?",
            ),
            Some(t(
                "Fällt normal aus, eher etwas länger.",
                "True to size, maybe a bit long.",
            )),
        ),
        (
            t("Ist das noch vollständig?", "Is it still complete?"),
            Some(t("Ja, alle Teile sind dabei.", "Yes, all parts are there.")),
        ),
        (t("Raucherhaushalt?", "Smoke-free home?"), None),
        (
            t(
                "Kann ich es zurücklegen lassen?",
                "Can you put it aside for me?",
            ),
            None,
        ),
    ];
    for (index, (question, answer)) in questions.into_iter().enumerate() {
        let listed = offerable[5 + index];
        let asked = demo.ask(b5, &listed, question).await?;
        if let Some(answer) = answer {
            demo.answer(&listed, asked, answer).await?;
        }
    }

    // The cash desk: about 40 % sold, in carts of up to three items
    let mut cart = Vec::new();
    cart.push(json!({ "eventProductId": offerable[1].relation, "offerId": redeemed }));
    if let Some(pram) = all
        .iter()
        .find(|l| l.item.minimum_price.is_some() && l.relation != offerable[1].relation)
    {
        let minimum = pram.item.minimum_price.unwrap_or(pram.item.price);
        demo.sell(
            lena,
            &[json!({ "eventProductId": pram.relation, "negotiatedPrice": minimum + 5.0 })],
            None,
        )
        .await?;
    }
    let reserved: Vec<Uuid> = offerable[..10].iter().map(|l| l.relation).collect();
    let mut buyer_index = 0;
    for listed in all.iter().skip(1) {
        if reserved.contains(&listed.relation) || !demo.dice.chance(40) {
            continue;
        }
        if listed.item.minimum_price.is_some() {
            continue;
        }
        cart.push(json!({ "eventProductId": listed.relation }));
        if cart.len() > demo.dice.below(3) {
            let email = (buyer_index % 3 == 0)
                .then(|| {
                    people
                        .emails
                        .get(&people.buyers[buyer_index % people.buyers.len()])
                        .cloned()
                })
                .flatten();
            let cashier = if buyer_index % 2 == 0 { lena } else { paul };
            demo.sell(cashier, &std::mem::take(&mut cart), email.as_deref())
                .await?;
            buyer_index += 1;
        }
    }
    if !cart.is_empty() {
        demo.sell(lena, &cart, None).await?;
    }

    // Walk-in seller without account, recorded on site
    let walk_in = demo
        .id(
            organizer,
            "walkInSellers.createWalkInSeller",
            json!({
                "eventId": event,
                "firstName": demo.text(WALK_IN.first),
                "lastName": demo.text(WALK_IN.last),
                "phone": "0731 556677",
            }),
        )
        .await?;
    let mut walk_in_items = Vec::new();
    for item in Demo::pick(KIDS, 9, 3) {
        let product = demo
            .id(
                organizer,
                "walkInSellers.saveWalkInProduct",
                json!({
                    "eventId": event,
                    "sellerId": walk_in,
                    "title": demo.text(item.title),
                    "description": demo.text(item.description),
                    "condition": item.condition,
                    "productCategory": demo.seeder.category(item.cat),
                    "price": item.price,
                }),
            )
            .await?;
        let relation: Uuid = sqlx::query_scalar(
            "SELECT id FROM event_products WHERE event_id = $1 AND product_id = $2",
        )
        .bind(event)
        .bind(product)
        .fetch_one(demo.ctx.conn())
        .await?;
        walk_in_items.push(Listed {
            product,
            relation,
            seller: walk_in,
            item,
        });
    }
    demo.check_in(lena, &walk_in_items[0], Some(clothes))
        .await?;
    demo.check_in(lena, &walk_in_items[1], Some(toys)).await?;
    demo.sell(
        paul,
        &[json!({ "eventProductId": walk_in_items[0].relation })],
        None,
    )
    .await?;

    demo.broadcast(
        organizer,
        event,
        t("Kuchenbuffet und Abholung", "Cake buffet and pick-up"),
        t(
            "Liebe Verkäuferinnen und Verkäufer,\n\ndanke fürs Mitmachen! Das Kuchenbuffet ist eröffnet – ein Stück geht aufs Haus. Nicht verkaufte Sachen könnt ihr ab 15 Uhr im Turnraum abholen.\n\nEuer Elternbeirat",
            "Dear sellers,\n\nthank you for taking part! The cake buffet is open – your first slice is on us. Unsold items can be picked up in the gym from 3 pm.\n\nYour parents' council",
        ),
        "all",
        false,
    )
    .await?;

    // A buyer thinks a price is a typo; the admin decides it is fine
    let report = demo
        .report(
            people.buyers[0],
            "product",
            all[5].product,
            "other",
            t(
                "Der Preis wirkt vertauscht, bitte prüfen.",
                "The price looks like a typo, please check.",
            ),
        )
        .await?;
    let admin = demo.admin;
    demo.call(
        admin,
        "moderation.resolveReport",
        json!({ "reportId": report, "status": "dismissed", "note": demo.text(t("Preis ist so gewollt.", "The price is intended.")) }),
    )
    .await?;

    demo.finish(
        event,
        now - Duration::hours(2),
        now + Duration::hours(8),
        None,
    )
    .await
}

/// In nine days: sellers registered their gear with the access code, check-in is still
/// ahead; drop-off and pick-up times are set.
async fn ski_bazaar(demo: &mut Demo<'_>, people: &People) -> anyhow::Result<()> {
    let now = demo.seeder.now;
    let organizer = people.organizers[1];
    let aylin = people.helpers[2];
    let event = demo
        .create_event(
            &EventPlan {
                organizer,
                title: t("Skibasar Skiclub Blautal", "Blue Valley Ski Club Ski Swap"),
                description: t(
                    "Gebrauchte Ski, Snowboards, Schuhe, Helme und Wintersportbekleidung. Unsere Skilehrer beraten beim Kauf, der Wachsservice ist vor Ort.\n\nVerkäufer melden sich mit dem Zugangscode aus dem Vereinsheft an.",
                    "Used skis, snowboards, boots, helmets and winter clothing. Our instructors help you choose, and the waxing service is on site.\n\nSellers register with the access code from the club newsletter.",
                ),
                location: t(
                    "Mehrzweckhalle Blaustein, Am Sportplatz 2",
                    "Blue Valley sports hall, 2 Sports Ground Road",
                ),
                contact: "skibasar@example.org",
                services: &["Parkplatz", "Skiservice", "Getränke"],
                visibility: "public",
                access_code: Some("SKI2026"),
                vendor_limit: Some(40),
                commission: 10.0,
                categories: &[Cat::Sports, Cat::Shoes, Cat::Clothing, Cat::Accessories],
                cover: "cover_winter",
                features: json!({
                    "discounts": false,
                    "priceOffers": true,
                    "minimumPrice": true,
                    "questions": true,
                    "photosOptional": true,
                    "priceOnLabel": true,
                    "intakeFee": 1,
                }),
            },
            true,
        )
        .await?;
    demo.helper(organizer, event, aylin, Some("SKI2026"))
        .await?;
    let mut all = Vec::new();
    for (index, seller) in people.sellers[8..16].iter().copied().enumerate() {
        demo.join(seller, event, Some("SKI2026")).await?;
        let count = 3 + index % 2;
        all.extend(
            demo.bring(seller, event, &Demo::pick(SKI, index, count), true)
                .await?,
        );
    }
    let questions = [
        (
            t(
                "Welche Sohlenlänge haben die Schuhe?",
                "What is the sole length of the boots?",
            ),
            Some(t("305 mm.", "305 mm.")),
        ),
        (
            t(
                "Passt die Bindung auch für Größe 44?",
                "Will the bindings fit size 10 boots?",
            ),
            None,
        ),
        (
            t(
                "Gibt es den Helm auch in L?",
                "Do you have the helmet in L as well?",
            ),
            None,
        ),
    ];
    for (index, (question, answer)) in questions.into_iter().enumerate() {
        let listed = all[index * 4];
        let asked = demo.ask(people.buyers[index], &listed, question).await?;
        if let Some(answer) = answer {
            demo.answer(&listed, asked, answer).await?;
        }
    }
    demo.broadcast(
        organizer,
        event,
        t("Annahme am Freitag ab 16 Uhr", "Drop-off on Friday from 4 pm"),
        t(
            "Hallo zusammen,\n\ndie Annahme ist am Freitag von 16 bis 19 Uhr. Bitte Ski zusammenbinden und Etiketten gut sichtbar anbringen.\n\nSportliche Grüße\nTeam Skibasar",
            "Hello everyone,\n\ndrop-off is on Friday from 4 to 7 pm. Please strap your skis together and attach the labels where they are easy to see.\n\nSee you there\nThe ski swap team",
        ),
        "all",
        false,
    )
    .await?;
    // A seller's photo shows a stranger's name: the report waits for an admin
    demo.report(
        people.buyers[5],
        "product",
        all[2].product,
        "personalData",
        t(
            "Auf dem Foto ist ein Namensschild mit Adresse zu sehen.",
            "The photo shows a name tag with an address.",
        ),
    )
    .await?;
    // "As new", but the photos are from a shop: hidden by the admin
    let fake = all[5];
    let report = demo
        .report(
            people.buyers[4],
            "product",
            fake.product,
            "fraud",
            t(
                "Angeblich neu, aber die Fotos stammen aus einem Onlineshop.",
                "Supposedly new, but the photos are from an online shop.",
            ),
        )
        .await?;
    let admin = demo.admin;
    demo.call(
        admin,
        "moderation.hideProduct",
        json!({
            "productId": fake.product,
            "reason": demo.text(t("Fotos nicht vom Verkäufer.", "Photos not taken by the seller.")),
            "reportId": report,
        }),
    )
    .await?;

    let start = berlin(now, 9, 9, 0);
    let end = berlin(now, 9, 14, 0);
    demo.finish(
        event,
        start,
        end,
        Some(Logistics {
            dropoff: (berlin(now, 8, 16, 0), berlin(now, 8, 19, 0)),
            pickup: (berlin(now, 9, 15, 0), berlin(now, 9, 16, 0)),
            note: t(
                "Ski bitte zusammengebunden und beschriftet abgeben.",
                "Please hand in skis strapped together and labelled.",
            ),
        }),
    )
    .await
}

/// Ended three days ago: most sellers are paid out, some still have to pick up.
async fn flea_market(demo: &mut Demo<'_>, people: &People) -> anyhow::Result<()> {
    let now = demo.seeder.now;
    let organizer = people.organizers[2];
    let paul = people.helpers[1];
    let event = demo
        .create_event(
            &EventPlan {
                organizer,
                title: t("Hofflohmarkt Südstadt", "Southside Yard Sale"),
                description: t(
                    "Flohmarkt im Innenhof des Stadtteiltreffs: Haushalt, Möbel, Elektronik, Fahrräder und Kleidung. Kaffee und Waffeln vom Nachbarschaftscafé.",
                    "Flea market in the courtyard of the community centre: household goods, furniture, electronics, bikes and clothes. Coffee and waffles from the neighbourhood café.",
                ),
                location: t(
                    "Stadtteiltreff Südstadt, Gartenweg 12",
                    "Southside community centre, 12 Garden Lane",
                ),
                contact: "suedstadt@example.org",
                services: &["Gastronomie"],
                visibility: "public",
                access_code: None,
                vendor_limit: None,
                commission: 10.0,
                categories: &[Cat::Household, Cat::Furniture, Cat::Electronics, Cat::Bikes, Cat::Clothing],
                cover: "cover_market",
                features: json!({
                    "discounts": true,
                    "discountStartsAt": millis(now - Duration::hours(1)),
                    "maxDiscountPercent": 50,
                    "priceOffers": true,
                    "minimumPrice": true,
                    "questions": true,
                }),
            },
            true,
        )
        .await?;
    demo.helper(organizer, event, paul, None).await?;
    let sellers: Vec<Uuid> = people.sellers[12..20]
        .iter()
        .chain(&people.sellers[0..2])
        .copied()
        .collect();
    let mut by_seller = Vec::new();
    for (index, seller) in sellers.iter().copied().enumerate() {
        demo.join(seller, event, None).await?;
        let listed = demo
            .bring(seller, event, &Demo::pick(GENERAL, index, 5), true)
            .await?;
        for item in &listed {
            demo.check_in(paul, item, None).await?;
        }
        by_seller.push((seller, listed));
    }
    let all: Vec<Listed> = by_seller
        .iter()
        .flat_map(|(_, l)| l.iter().copied())
        .collect();
    let offerable: Vec<Listed> = all
        .iter()
        .copied()
        .filter(|l| l.item.price >= 15.0)
        .collect();
    // One left open on an item not picked up yet (expires with the event), one redeemed
    // at the cash desk, one rejected
    let unclaimed = by_seller[9]
        .1
        .iter()
        .find(|l| l.item.price >= 15.0)
        .copied()
        .context("an item of the last seller takes offers")?;
    demo.offer(people.buyers[0], &unclaimed, 80.0, None).await?;
    let redeemed = demo
        .offer(people.buyers[1], &offerable[1], 90.0, None)
        .await?;
    demo.respond(&offerable[1], redeemed, true).await?;
    let rejected = demo
        .offer(people.buyers[2], &offerable[2], 40.0, None)
        .await?;
    demo.respond(&offerable[2], rejected, false).await?;
    demo.sell(
        organizer,
        &[json!({ "eventProductId": offerable[1].relation, "offerId": redeemed })],
        None,
    )
    .await?;
    // A rude question someone reports; the admin deletes it
    let rude = demo
        .ask(
            people.buyers[2],
            &offerable[3],
            t(
                "Viel zu teuer, das ist doch Abzocke!!!",
                "Way too expensive, what a rip-off!!!",
            ),
        )
        .await?;
    let polite = demo
        .ask(
            people.buyers[3],
            &offerable[4],
            t(
                "Funktioniert alles einwandfrei?",
                "Does everything work properly?",
            ),
        )
        .await?;
    demo.answer(
        &offerable[4],
        polite,
        t("Ja, alles getestet.", "Yes, all tested."),
    )
    .await?;
    let report = demo
        .report(
            people.buyers[3],
            "question",
            rude,
            "offensive",
            t(
                "Beleidigender Ton gegenüber dem Verkäufer.",
                "Insulting tone towards the seller.",
            ),
        )
        .await?;
    let admin = demo.admin;
    demo.call(
        admin,
        "moderation.deleteQuestion",
        json!({ "questionId": rude, "reason": demo.text(t("Beleidigend.", "Offensive.")), "reportId": report }),
    )
    .await?;

    let mut reserved: Vec<Uuid> = offerable[..5].iter().map(|l| l.relation).collect();
    reserved.push(unclaimed.relation);
    for chunk in all
        .iter()
        .filter(|l| !reserved.contains(&l.relation))
        .collect::<Vec<_>>()
        .chunks(2)
    {
        let cart: Vec<Value> = chunk
            .iter()
            .filter(|_| demo.dice.chance(55))
            .map(|l| match l.item.minimum_price {
                Some(minimum) => {
                    json!({ "eventProductId": l.relation, "negotiatedPrice": minimum })
                }
                None => json!({ "eventProductId": l.relation }),
            })
            .collect();
        if !cart.is_empty() {
            demo.sell(paul, &cart, None).await?;
        }
    }
    demo.broadcast(
        organizer,
        event,
        t("Bitte Restposten abholen", "Please pick up your unsold items"),
        t(
            "Hallo,\n\nein paar von euch haben ihre nicht verkauften Sachen noch bei uns. Abholung ist bis Samstag 12 Uhr im Stadtteiltreff möglich.\n\nViele Grüße\nMiriam",
            "Hello,\n\nsome of you still have unsold items with us. You can pick them up at the community centre until Saturday noon.\n\nBest wishes\nGrace",
        ),
        "pickup",
        false,
    )
    .await?;
    // Six settled (unsold items back, paid out), two with items returned but not yet paid,
    // two who have not come back yet
    for (index, (seller, _)) in by_seller.iter().enumerate() {
        match index {
            0..6 => {
                demo.call(
                    organizer,
                    "eventSeller.settleVendor",
                    json!({ "eventId": event, "vendorUserId": seller }),
                )
                .await?;
            }
            6..8 => {
                demo.call(
                    organizer,
                    "eventProducts.markAllVendorProductsReturned",
                    json!({ "eventId": event, "vendorId": seller }),
                )
                .await?;
            }
            _ => {}
        }
    }
    demo.finish(event, berlin(now, -3, 10, 0), berlin(now, -3, 16, 0), None)
        .await
}

/// Eight months ago, everything settled: the archive of an organizer.
async fn book_market(demo: &mut Demo<'_>, people: &People) -> anyhow::Result<()> {
    let now = demo.seeder.now;
    let organizer = people.organizers[2];
    let event = demo
        .create_event(
            &EventPlan {
                organizer,
                title: t("Bücherflohmarkt Stadtbibliothek", "City Library Book Sale"),
                description: t(
                    "Gebrauchte Bücher für den guten Zweck: Romane, Sachbücher, Kinderbücher. Der Erlös geht an die Leseförderung.",
                    "Second-hand books for a good cause: novels, non-fiction and children's books. Proceeds go to reading programmes.",
                ),
                location: t("Stadtbibliothek, Foyer", "City library, foyer"),
                contact: "bibliothek@example.org",
                services: &["Getränke"],
                visibility: "public",
                access_code: None,
                vendor_limit: Some(20),
                commission: 20.0,
                categories: &[Cat::Books],
                cover: "cover_library",
                features: json!({ "discounts": false, "priceOnLabel": true }),
            },
            true,
        )
        .await?;
    let mut all = Vec::new();
    let sellers: Vec<Uuid> = people.sellers[2..7].to_vec();
    for (index, seller) in sellers.iter().copied().enumerate() {
        demo.join(seller, event, None).await?;
        let listed = demo
            .bring(
                seller,
                event,
                &Demo::pick(BOOKS, index, 3 + index % 2),
                false,
            )
            .await?;
        for item in &listed {
            demo.check_in(organizer, item, None).await?;
        }
        all.extend(listed);
    }
    let sold: Vec<Value> = all
        .iter()
        .filter(|_| demo.dice.chance(70))
        .map(|l| json!({ "eventProductId": l.relation }))
        .collect();
    for cart in sold.chunks(3) {
        demo.sell(organizer, cart, None).await?;
    }
    for seller in sellers {
        demo.call(
            organizer,
            "eventSeller.settleVendor",
            json!({ "eventId": event, "vendorUserId": seller }),
        )
        .await?;
    }
    demo.finish(
        event,
        berlin(now, -240, 10, 0),
        berlin(now, -240, 15, 0),
        None,
    )
    .await
}

/// Waiting for approval, rejected, full, and a spam event an admin hid.
async fn other_events(demo: &mut Demo<'_>, people: &People) -> anyhow::Result<()> {
    let now = demo.seeder.now;
    let jonas = people.organizers[3];
    let plan = |organizer, title, description, location, cover| EventPlan {
        organizer,
        title,
        description,
        location,
        contact: "kontakt@example.org",
        services: &[],
        visibility: "public",
        access_code: None,
        vendor_limit: None,
        commission: 10.0,
        categories: &[Cat::Bikes, Cat::Sports],
        cover,
        features: json!({ "discounts": true, "priceOffers": true }),
    };

    let pending = demo
        .create_event(
            &plan(
                jonas,
                t("Fahrradmarkt am Rathaus", "Town Hall Bike Market"),
                t(
                    "Gebrauchte Fahrräder, Ersatzteile und eine Codier-Aktion der Polizei.",
                    "Used bikes, spare parts and free bike marking by the police.",
                ),
                t("Rathausplatz", "Town hall square"),
                "cover_bikes",
            ),
            false,
        )
        .await?;
    demo.finish(
        pending,
        berlin(now, 30, 10, 0),
        berlin(now, 30, 15, 0),
        None,
    )
    .await?;

    let rejected = demo
        .create_event(
            &plan(
                jonas,
                t("Tauschbörse Turnhalle", "Gym Swap Meet"),
                t("Tauschen statt kaufen.", "Swap instead of buying."),
                t("Turnhalle", "Gym"),
                "cover_rack",
            ),
            false,
        )
        .await?;
    if demo.is_pending(rejected).await? {
        let admin = demo.admin;
        demo.call(
            admin,
            "events.rejectEventForAdmin",
            json!({
                "eventId": rejected,
                "reason": demo.text(t(
                    "Bitte ergänze die genaue Adresse und wie die Abgabe abläuft.",
                    "Please add the full address and how the drop-off works.",
                )),
            }),
        )
        .await?;
    }
    demo.finish(
        rejected,
        berlin(now, 20, 14, 0),
        berlin(now, 20, 17, 0),
        None,
    )
    .await?;

    // Only three sellers, all places taken; only for signed-in users
    let sabine = people.organizers[0];
    let full = demo
        .create_event(
            &EventPlan {
                vendor_limit: Some(3),
                visibility: "logged-in",
                categories: &[Cat::Clothing, Cat::Shoes],
                features: json!({ "discounts": false, "labelFormat": "small" }),
                ..plan(
                    sabine,
                    t("Kleiderbasar Gemeindehaus", "Parish Hall Clothes Sale"),
                    t(
                        "Kleiner Basar für Damen- und Kinderkleidung im Gemeindehaus.",
                        "A small sale of women's and children's clothes in the parish hall.",
                    ),
                    t("Gemeindehaus St. Georg", "St George's parish hall"),
                    "cover_rack",
                )
            },
            true,
        )
        .await?;
    for (index, seller) in people.sellers[16..19].iter().copied().enumerate() {
        demo.join(seller, full, None).await?;
        demo.bring(seller, full, &Demo::pick(KIDS, index, 2), false)
            .await?;
    }
    demo.finish(full, berlin(now, 21, 14, 0), berlin(now, 21, 17, 0), None)
        .await?;

    // Spam: reported, hidden and the account banned
    let spam = demo
        .create_event(
            &EventPlan {
                categories: &[Cat::Clothing, Cat::Accessories],
                ..plan(
                    people.spammer,
                    t(
                        "Markenware zu Spottpreisen!!!",
                        "Designer goods at crazy prices!!!",
                    ),
                    t(
                        "Original Markentaschen ab 9,99 €. Nur Vorkasse.",
                        "Original designer bags from €9.99. Payment in advance only.",
                    ),
                    t("Online", "Online"),
                    "cover_store",
                )
            },
            true,
        )
        .await?;
    let report = demo
        .report(
            people.buyers[1],
            "event",
            spam,
            "fraud",
            t(
                "Gefälschte Ware, Vorkasse – sieht nach Betrug aus.",
                "Counterfeit goods and payment in advance – looks like a scam.",
            ),
        )
        .await?;
    let admin = demo.admin;
    let reason = demo.text(t("Betrugsverdacht.", "Suspected fraud."));
    demo.call(
        admin,
        "moderation.hideEvent",
        json!({ "eventId": spam, "reason": reason, "reportId": report }),
    )
    .await?;
    demo.call(
        admin,
        "moderation.banUser",
        json!({ "userId": people.spammer, "reason": reason }),
    )
    .await?;
    demo.finish(spam, berlin(now, 5, 10, 0), berlin(now, 5, 18, 0), None)
        .await
}

async fn contact_messages(demo: &mut Demo<'_>) -> anyhow::Result<()> {
    let messages = [
        (
            t("Petra Sommer", "Patricia Summers"),
            "petra.sommer@example.org",
            t(
                "Hallo, wir möchten für unseren Kindergarten einen Basar anlegen. Ist BazarPro für Vereine kostenlos?",
                "Hello, we would like to run a bazaar for our nursery. Is BazarPro free for associations?",
            ),
        ),
        (
            t("Frank Licht", "Frank Light"),
            "frank.licht@example.org",
            t(
                "Ich habe meinen Bestätigungscode nicht bekommen. Können Sie helfen?",
                "I did not receive my confirmation code. Can you help?",
            ),
        ),
        (
            t("Maria Gruber", "Maria Grant"),
            "maria.gruber@example.org",
            t(
                "Kann man die Etiketten auch auf normalem Papier drucken?",
                "Can the labels be printed on plain paper as well?",
            ),
        ),
    ];
    let mut ids = Vec::new();
    for (name, email, message) in messages {
        let (name, message) = (demo.text(name), demo.text(message));
        demo.ctx
            .call(
                None,
                "messages.sendMessage",
                json!({ "name": name, "email": email, "message": message, "acceptedPrivacyPolicy": true }),
            )
            .await
            .map_err(|err| anyhow!("messages.sendMessage: {err}"))?;
        let id: Uuid = sqlx::query_scalar(
            "SELECT id FROM contact_messages WHERE email = $1 ORDER BY created_at DESC LIMIT 1",
        )
        .bind(email)
        .fetch_one(demo.ctx.conn())
        .await?;
        ids.push(id);
    }
    let admin = demo.admin;
    demo.call(
        admin,
        "moderation.setMessageHandled",
        json!({ "messageId": ids[1], "handled": true }),
    )
    .await?;
    sqlx::query(
        "UPDATE contact_messages SET created_at = now() - (random() * interval '6 days') WHERE id = ANY($1)",
    )
    .bind(&ids)
    .execute(demo.ctx.conn())
    .await?;
    Ok(())
}
