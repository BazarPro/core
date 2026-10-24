//! The demo data the end-to-end tests rely on: test users, a few events and the showcase
//! bazaar with every feature. Written directly to the tables.

use chrono::{DateTime, Duration, Utc};
use rust_decimal::Decimal;
use serde::Serialize;
use serde_json::{Value, json};
use uuid::Uuid;

use super::catalog::{Cat, t};
use super::{Seeder, UserSpec};
use crate::error::AppResult;
use crate::money::Cents;
use crate::rpc::Ctx;

pub const SEED_ADMIN_EMAIL: &str = "admin@bazarpro.de";
const HOUR: i64 = 60 * 60 * 1000;
const DAY: i64 = 24 * HOUR;
/// Runs for days, so review apps can be tried out without reseeding.
pub const SHOWCASE_DURATION_HOURS: i64 = 7 * 24;

pub const SHOWCASE_TITLE: super::catalog::Text = t(
    "Fahrradbörse Bürgerhalle (alle Funktionen)",
    "Bike bazaar community hall (all features)",
);

fn ms(offset_ms: i64, now: DateTime<Utc>) -> DateTime<Utc> {
    now + Duration::milliseconds(offset_ms)
}

/// IDs of the showcase, for the end-to-end tests (helpers/features.ts).
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Showcase {
    pub event_id: Uuid,
    pub walk_in_id: Uuid,
    pub products: ShowcaseProducts,
}

#[derive(Serialize)]
pub struct ShowcaseProducts {
    pub trekking: Uuid,
    pub mtb: Uuid,
    pub city: Uuid,
    pub kids: Uuid,
    pub road: Uuid,
    pub balance: Uuid,
    pub ebike: Uuid,
    pub holland: Uuid,
    pub folding: Uuid,
}

pub struct ShowcaseUsers {
    pub organizer: Uuid,
    pub helper: Uuid,
    pub sellers: [Uuid; 3],
    pub buyers: [Uuid; 2],
}

struct Bike<'a> {
    title: &'a str,
    description: &'a str,
    price: i64,
    images: Vec<Uuid>,
    attributes: Value,
    accepts_offers: bool,
    minimum_price: Option<i64>,
}

struct Listing<'a> {
    status: &'a str,
    discount_percent: Option<i64>,
    internal_note: Option<&'a str>,
}

const fn listing(status: &str) -> Listing<'_> {
    Listing {
        status,
        discount_percent: None,
        internal_note: None,
    }
}

/// A running bike bazaar with every organizer feature switched on and realistic data:
/// items in each state, discounts, an internal note, open and answered questions,
/// pending and accepted offers, sales at label, offer and negotiated prices, a return
/// and a walk-in seller.
pub async fn insert_feature_showcase(
    seeder: &Seeder,
    ctx: &mut Ctx,
    title: &str,
    users: &ShowcaseUsers,
    cover: Option<Uuid>,
) -> AppResult<Showcase> {
    const COMMISSION: i64 = 10;
    let now = seeder.now;
    let [seller, user3, user4] = users.sellers;
    let [buyer_a, buyer_b] = users.buyers;
    let tr = |de: &'static str, en: &'static str| seeder.text(t(de, en));
    let category = seeder.category(Cat::Bikes);

    let event_id: Uuid = sqlx::query_scalar(
        "INSERT INTO events (title, description, location, start_date, end_date, contact_info,
           services, visibility, is_approved, approval_status, commission, organizer_id,
           cover_image_id, features)
         VALUES ($1, $2, $3, $4, $5, $6, '{Parkplatz,Getränke}', 'public', true, 'approved', $7,
           $8, $9, $10) RETURNING id",
    )
    .bind(title)
    .bind(tr(
        "Laufende Demo-Börse mit allen Funktionen: Rabatte ab einer Uhrzeit, Preisvorschläge, Verhandeln bis zum Mindestpreis und Fragen an die Verkäufer.",
        "A running demo bazaar with every feature: discounts from a set time, price offers, haggling down to a minimum price and questions to the sellers.",
    ))
    .bind(tr(
        "Bürgerhalle, Parkplatz an der Wendeplatte",
        "Community hall, car park by the turning circle",
    ))
    .bind(ms(-2 * HOUR, now))
    .bind(now + Duration::hours(SHOWCASE_DURATION_HOURS))
    .bind("fahrradboerse@bazarpro.de")
    .bind(Decimal::from(COMMISSION))
    .bind(users.organizer)
    .bind(cover)
    .bind(json!({
        "discounts": true,
        "discountStartsAt": (now - Duration::hours(1)).timestamp_millis(),
        "maxDiscountPercent": 30,
        "priceOffers": true,
        "minimumPrice": true,
        "questions": true,
    }))
    .fetch_one(ctx.conn())
    .await?;
    sqlx::query(
        "INSERT INTO event_categories (event_id, position, category_id) VALUES ($1, 0, $2)",
    )
    .bind(event_id)
    .bind(category)
    .execute(ctx.conn())
    .await?;
    seeder
        .add_role(ctx, event_id, users.organizer, "organizer")
        .await?;
    seeder
        .add_role(ctx, event_id, users.helper, "coorganizer")
        .await?;
    for user in users.sellers {
        seeder.add_seller(ctx, event_id, user, false).await?;
    }

    let walk_in: Uuid = sqlx::query_scalar(
        "INSERT INTO users (name, first_name, last_name, phone, status, system_role,
           needs_onboarding, managed_by_event_id)
         VALUES ($1, $2, $3, '0151 2345678', 'active', 'user', false, $4) RETURNING id",
    )
    .bind(tr("Erika Muster", "Erica Sample"))
    .bind(tr("Erika", "Erica"))
    .bind(tr("Muster", "Sample"))
    .bind(event_id)
    .fetch_one(ctx.conn())
    .await?;
    seeder.add_seller(ctx, event_id, walk_in, false).await?;

    let product_images: Vec<Uuid> = seeder.product_images();
    let mut image_counter = 0;
    let image = |key: &str| seeder.image(key).into_iter().collect::<Vec<_>>();

    // The product form requires a photo, so sellers' items get one; walk-in items are
    // recorded on site without photos
    let mut bike = async |ctx: &mut Ctx,
                          vendor: Uuid,
                          bike: Bike<'_>,
                          listing: Listing<'_>|
           -> AppResult<(Uuid, Uuid)> {
        let images = if !bike.images.is_empty() || vendor == walk_in || product_images.is_empty() {
            bike.images
        } else {
            image_counter += 1;
            vec![product_images[(image_counter - 1) % product_images.len()]]
        };
        let product: Uuid = sqlx::query_scalar(
            "INSERT INTO products (title, description, price, vendor_id, condition, category_id,
               ready_for_sale, sold, attributes, accepts_offers, minimum_price)
             VALUES ($1, $2, $3, $4, 'good', $5, true, $6, $7, $8, $9) RETURNING id",
        )
        .bind(bike.title)
        .bind(bike.description)
        .bind(Decimal::from(bike.price))
        .bind(vendor)
        .bind(category)
        .bind(listing.status == "sold")
        .bind(bike.attributes)
        .bind(bike.accepts_offers.then_some(true))
        .bind(bike.minimum_price.map(Decimal::from))
        .fetch_one(ctx.conn())
        .await?;
        Seeder::set_images(ctx, product, &images).await?;
        let relation: Uuid = sqlx::query_scalar(
            "INSERT INTO event_products (event_id, product_id, status, discount_percent, internal_note)
             VALUES ($1, $2, $3::event_product_status, $4, $5) RETURNING id",
        )
        .bind(event_id)
        .bind(product)
        .bind(listing.status)
        .bind(listing.discount_percent.map(Decimal::from))
        .bind(listing.internal_note)
        .fetch_one(ctx.conn())
        .await?;
        Ok((product, relation))
    };

    let sell = async |ctx: &mut Ctx,
                      product: Uuid,
                      seller: Uuid,
                      list_price: i64,
                      total: i64,
                      source: &str,
                      discount: Option<i64>,
                      offer: Option<Uuid>|
           -> AppResult<()> {
        let total = Decimal::from(total);
        let commission = (total * Decimal::from(COMMISSION) / Decimal::from(100)).cents();
        sqlx::query(
            "INSERT INTO purchases (product_id, event_id, seller_id, total_amount, commission_amount,
               payout_amount, payout_status, payout_date, list_price, price_source, discount_percent, offer_id)
             VALUES ($1, $2, $3, $4, $5, $6, false, 'epoch', $7, $8::purchase_price_source, $9, $10)",
        )
        .bind(product)
        .bind(event_id)
        .bind(seller)
        .bind(total)
        .bind(commission)
        .bind(total - commission)
        .bind(Decimal::from(list_price))
        .bind(source)
        .bind(discount.map(Decimal::from))
        .bind(offer)
        .execute(ctx.conn())
        .await?;
        Ok(())
    };

    let offer = async |ctx: &mut Ctx,
                       (product, relation): (Uuid, Uuid),
                       buyer: Uuid,
                       amount: i64,
                       message: Option<&str>,
                       status: &str,
                       created: i64,
                       responded: Option<i64>|
           -> AppResult<Uuid> {
        Ok(sqlx::query_scalar(
            "INSERT INTO product_offers (event_id, product_id, event_product_id, buyer_id, amount,
               message, status, created_at, responded_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7::offer_status, $8, $9) RETURNING id",
        )
        .bind(event_id)
        .bind(product)
        .bind(relation)
        .bind(buyer)
        .bind(Decimal::from(amount))
        .bind(message)
        .bind(status)
        .bind(ms(created, now))
        .bind(responded.map(|offset| ms(offset, now)))
        .fetch_one(ctx.conn())
        .await?)
    };

    let attrs = |pairs: &[(&str, &str)]| {
        Value::Object(
            pairs
                .iter()
                .map(|(key, value)| ((*key).to_owned(), Value::from(*value)))
                .collect(),
        )
    };
    let inch = |n: &str| match seeder.locale {
        crate::i18n::Locale::De => format!("{n} Zoll"),
        crate::i18n::Locale::En => format!("{n} inch"),
    };

    // Available, discounted, with key-board note, questions and an open offer
    let trekking = bike(
        ctx,
        seller,
        Bike {
            title: "Trekkingrad Cube Touring 28\"",
            description: tr(
                "Shimano Deore, Nabendynamo, Gepäckträger. Regelmäßig gewartet.",
                "Shimano Deore, hub dynamo, rear rack. Serviced regularly.",
            ),
            price: 420,
            images: image("mtb"),
            attributes: attrs(&[
                ("frameNumber", "WCU 4711 0815"),
                ("frameSize", "56 cm"),
                ("wheelSize", &inch("28")),
                ("brand", "Cube"),
            ]),
            accepts_offers: true,
            minimum_price: Some(350),
        },
        Listing {
            status: "available",
            discount_percent: Some(10),
            internal_note: Some(tr("Schlüssel an Haken 12", "Key on hook 12")),
        },
    )
    .await?;
    sqlx::query(
        "INSERT INTO product_questions (event_id, product_id, asker_id, question, answer, answered_by,
           created_at, answered_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8), ($1, $2, $9, $10, NULL, NULL, $11, NULL)",
    )
    .bind(event_id)
    .bind(trekking.0)
    .bind(buyer_a)
    .bind(tr(
        "Ist das Licht dabei und funktioniert es?",
        "Are the lights included and do they work?",
    ))
    .bind(tr(
        "Ja, Nabendynamo vorne und LED hinten, beides funktioniert.",
        "Yes, hub dynamo at the front and an LED at the back, both work.",
    ))
    .bind(seller)
    .bind(ms(-90 * 60 * 1000, now))
    .bind(ms(-80 * 60 * 1000, now))
    .bind(buyer_b)
    .bind(tr(
        "Gibt es noch die Rechnung vom Kauf?",
        "Do you still have the original receipt?",
    ))
    .bind(ms(-20 * 60 * 1000, now))
    .execute(ctx.conn())
    .await?;
    offer(
        ctx,
        trekking,
        buyer_a,
        360,
        Some(tr(
            "Würde es gegen 14 Uhr abholen.",
            "I could pick it up around 2 pm.",
        )),
        "pending",
        -30 * 60 * 1000,
        None,
    )
    .await?;

    // Available with an accepted offer, waiting for the buyer at the cash desk
    let mtb = bike(
        ctx,
        seller,
        Bike {
            title: "Mountainbike Scott Aspect 27,5\"",
            description: tr(
                "Hydraulische Scheibenbremsen, Federgabel mit Lockout.",
                "Hydraulic disc brakes, suspension fork with lockout.",
            ),
            price: 380,
            images: image("mtb_mountains"),
            attributes: attrs(&[
                ("frameNumber", "SC 99812"),
                ("frameSize", "M"),
                ("wheelSize", &inch("27,5")),
                ("brand", "Scott"),
            ]),
            accepts_offers: true,
            minimum_price: None,
        },
        listing("available"),
    )
    .await?;
    offer(
        ctx,
        mtb,
        buyer_b,
        330,
        None,
        "accepted",
        -HOUR,
        Some(-50 * 60 * 1000),
    )
    .await?;

    // Announced, still to be accepted on site
    let city = bike(
        ctx,
        seller,
        Bike {
            title: "Cityrad Pegasus Solero",
            description: tr(
                "7-Gang-Nabenschaltung, Korb vorne.",
                "7-speed hub gears, front basket.",
            ),
            price: 260,
            images: vec![],
            attributes: attrs(&[
                ("frameSize", "50 cm"),
                ("wheelSize", &inch("28")),
                ("brand", "Pegasus"),
            ]),
            accepts_offers: false,
            minimum_price: None,
        },
        listing("announced"),
    )
    .await?;

    let kids = bike(
        ctx,
        user3,
        Bike {
            title: tr("Kinderrad Puky 20 Zoll", "Kids' bike Puky 20 inch"),
            description: tr(
                "Mit Rücktrittbremse, ideal ab 6 Jahren.",
                "With coaster brake, ideal from age 6.",
            ),
            price: 90,
            images: vec![],
            attributes: attrs(&[("wheelSize", &inch("20")), ("brand", "Puky")]),
            accepts_offers: false,
            minimum_price: None,
        },
        Listing {
            status: "available",
            discount_percent: Some(20),
            internal_note: None,
        },
    )
    .await?;

    // Sold, negotiated down at the cash desk
    let road = bike(
        ctx,
        user3,
        Bike {
            title: tr("Rennrad Canyon Endurace", "Road bike Canyon Endurace"),
            description: tr("Carbon-Rahmen, Shimano 105.", "Carbon frame, Shimano 105."),
            price: 850,
            images: vec![],
            attributes: attrs(&[
                ("frameNumber", "CN 2021 5543"),
                ("frameSize", "56 cm"),
                ("brand", "Canyon"),
            ]),
            accepts_offers: false,
            minimum_price: Some(750),
        },
        Listing {
            status: "sold",
            discount_percent: None,
            internal_note: Some(tr(
                "Rahmennummer mit Käufer abgeglichen",
                "Frame number checked with the buyer",
            )),
        },
    )
    .await?;
    sell(ctx, road.0, user3, 850, 780, "negotiated", None, None).await?;

    // Returned to the seller, editable again
    let balance = bike(
        ctx,
        user3,
        Bike {
            title: tr("Laufrad Woom 1", "Balance bike Woom 1"),
            description: tr(
                "Leichtes Laufrad für Kleinkinder.",
                "Light balance bike for toddlers.",
            ),
            price: 120,
            images: vec![],
            attributes: attrs(&[("wheelSize", &inch("12")), ("brand", "Woom")]),
            accepts_offers: false,
            minimum_price: None,
        },
        listing("returned"),
    )
    .await?;

    // Sold via an accepted online offer
    let ebike = bike(
        ctx,
        user4,
        Bike {
            title: "E-Bike Kalkhoff Image 3.B",
            description: tr(
                "Bosch Mittelmotor, Akku 500 Wh, ca. 2.000 km.",
                "Bosch mid motor, 500 Wh battery, about 2,000 km.",
            ),
            price: 1200,
            images: vec![],
            attributes: attrs(&[
                ("frameNumber", "KH 3B 77120"),
                ("frameSize", "50 cm"),
                ("brand", "Kalkhoff"),
            ]),
            accepts_offers: true,
            minimum_price: None,
        },
        listing("sold"),
    )
    .await?;
    let ebike_offer = offer(
        ctx,
        ebike,
        buyer_a,
        1100,
        None,
        "accepted",
        -100 * 60 * 1000,
        Some(-95 * 60 * 1000),
    )
    .await?;
    sell(
        ctx,
        ebike.0,
        user4,
        1200,
        1100,
        "offer",
        None,
        Some(ebike_offer),
    )
    .await?;

    // Sold at the discounted label price
    let holland = bike(
        ctx,
        user4,
        Bike {
            title: tr("Hollandrad Gazelle", "Dutch bike Gazelle"),
            description: tr(
                "Klassiker mit Rücktritt, leichte Gebrauchsspuren.",
                "A classic with coaster brake, light signs of use.",
            ),
            price: 150,
            images: vec![],
            attributes: attrs(&[
                ("frameSize", "57 cm"),
                ("wheelSize", &inch("28")),
                ("brand", "Gazelle"),
            ]),
            accepts_offers: false,
            minimum_price: None,
        },
        Listing {
            status: "sold",
            discount_percent: Some(10),
            internal_note: None,
        },
    )
    .await?;
    sell(ctx, holland.0, user4, 150, 135, "list", Some(10), None).await?;

    // Walk-in seller: one item accepted, one still to be accepted
    let recorded = tr("Vor Ort erfasst.", "Recorded on site.");
    let folding = bike(
        ctx,
        walk_in,
        Bike {
            title: tr("Faltrad Brompton M6L", "Folding bike Brompton M6L"),
            description: recorded,
            price: 600,
            images: vec![],
            attributes: attrs(&[("brand", "Brompton"), ("wheelSize", &inch("16"))]),
            accepts_offers: false,
            minimum_price: None,
        },
        Listing {
            status: "available",
            discount_percent: None,
            internal_note: Some(tr("Kein Schloss", "No lock")),
        },
    )
    .await?;
    bike(
        ctx,
        walk_in,
        Bike {
            title: tr("Jugendrad Cube Acid 240", "Youth bike Cube Acid 240"),
            description: recorded,
            price: 180,
            images: vec![],
            attributes: attrs(&[("wheelSize", &inch("24")), ("brand", "Cube")]),
            accepts_offers: false,
            minimum_price: None,
        },
        listing("announced"),
    )
    .await?;

    Ok(Showcase {
        event_id,
        walk_in_id: walk_in,
        products: ShowcaseProducts {
            trekking: trekking.0,
            mtb: mtb.0,
            city: city.0,
            kids: kids.0,
            road: road.0,
            balance: balance.0,
            ebike: ebike.0,
            holland: holland.0,
            folding: folding.0,
        },
    })
}

pub struct CoreUsers {
    pub admin: Uuid,
    pub test_users: [Uuid; 5],
    pub seller: Uuid,
    pub showcase: ShowcaseUsers,
}

/// The test users (all with password 123456).
pub async fn insert_users(seeder: &Seeder, ctx: &mut Ctx) -> AppResult<CoreUsers> {
    let mut test_users = [Uuid::nil(); 5];
    for (i, slot) in test_users.iter_mut().enumerate() {
        let n = i + 1;
        *slot = seeder
            .ensure_user(
                ctx,
                &UserSpec::simple(&format!("user{n}@bazarpro.de"), &format!("Test User {n}")),
            )
            .await?;
    }
    let admin = seeder
        .ensure_user(
            ctx,
            &UserSpec {
                admin: true,
                ..UserSpec::simple(SEED_ADMIN_EMAIL, "Admin User")
            },
        )
        .await?;
    // With a complete profile: several end-to-end tests register this seller for their
    // events in parallel, and none of them should have to fill in the contact steps
    let seller = seeder
        .ensure_user(
            ctx,
            &UserSpec {
                phone: Some("0151 1234567".to_owned()),
                street: Some(
                    seeder
                        .text(t("Musterstraße 1", "1 Sample Street"))
                        .to_owned(),
                ),
                zip_code: Some(seeder.text(t("89073", "OX1 2JD"))),
                city: Some(seeder.text(t("Ulm", "Oxford"))),
                country: Some(seeder.text(t("Deutschland", "United Kingdom"))),
                ..UserSpec::simple("seller@bazarpro.de", "Demo Seller")
            },
        )
        .await?;
    // Accounts only used by the feature showcase, so other E2E tests (password change,
    // account deletion of user4/user5) never touch them
    let showcase_seller = seeder
        .ensure_user(
            ctx,
            &UserSpec::simple(
                "haendler@bazarpro.de",
                seeder.text(t("Hanna Händler", "Hanna Trader")),
            ),
        )
        .await?;
    let buyer_a = seeder
        .ensure_user(
            ctx,
            &UserSpec::simple(
                "kaeufer1@bazarpro.de",
                seeder.text(t("Kim Käufer", "Kim Buyer")),
            ),
        )
        .await?;
    let buyer_b = seeder
        .ensure_user(
            ctx,
            &UserSpec::simple(
                "kaeufer2@bazarpro.de",
                seeder.text(t("Kai Käufer", "Kai Buyer")),
            ),
        )
        .await?;
    Ok(CoreUsers {
        admin,
        test_users,
        seller,
        showcase: ShowcaseUsers {
            organizer: test_users[0],
            helper: test_users[1],
            sellers: [seller, test_users[2], showcase_seller],
            buyers: [buyer_a, buyer_b],
        },
    })
}

struct EventSpec<'a> {
    title: &'a str,
    description: &'a str,
    location: &'a str,
    start_offset_ms: i64,
    end_offset_ms: i64,
    contact_info: &'a str,
    services: &'a [&'a str],
    commission: i64,
    organizer: Uuid,
    cover: Option<Uuid>,
}

async fn insert_event(seeder: &Seeder, ctx: &mut Ctx, spec: EventSpec<'_>) -> AppResult<Uuid> {
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO events (title, description, location, start_date, end_date, contact_info,
           services, visibility, commission, organizer_id, cover_image_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7::event_service[], 'public', $8, $9, $10) RETURNING id",
    )
    .bind(spec.title)
    .bind(spec.description)
    .bind(spec.location)
    .bind(ms(spec.start_offset_ms, seeder.now))
    .bind(ms(spec.end_offset_ms, seeder.now))
    .bind(spec.contact_info)
    .bind(spec.services)
    .bind(Decimal::from(spec.commission))
    .bind(spec.organizer)
    .bind(spec.cover)
    .fetch_one(ctx.conn())
    .await?;
    sqlx::query(
        "INSERT INTO event_categories (event_id, position, category_id) VALUES ($1, 0, $2)",
    )
    .bind(id)
    .bind(seeder.category(Cat::Sports))
    .execute(ctx.conn())
    .await?;
    seeder
        .add_role(ctx, id, spec.organizer, "organizer")
        .await?;
    Ok(id)
}

struct ProductSpec<'a> {
    title: &'a str,
    description: &'a str,
    condition: &'a str,
    price: i64,
    vendor: Uuid,
    sold: bool,
    images: &'a [&'a str],
    days_ago: i64,
}

async fn insert_product(seeder: &Seeder, ctx: &mut Ctx, spec: ProductSpec<'_>) -> AppResult<Uuid> {
    let at = ms(-spec.days_ago * DAY, seeder.now);
    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO products (title, description, condition, price, vendor_id, category_id,
           ready_for_sale, sold, updated_at, created_at)
         VALUES ($1, $2, $3::product_condition, $4, $5, $6, true, $7, $8, $8) RETURNING id",
    )
    .bind(spec.title)
    .bind(spec.description)
    .bind(spec.condition)
    .bind(Decimal::from(spec.price))
    .bind(spec.vendor)
    .bind(seeder.category(Cat::Sports))
    .bind(spec.sold)
    .bind(at)
    .fetch_one(ctx.conn())
    .await?;
    let images: Vec<Uuid> = spec
        .images
        .iter()
        .filter_map(|key| seeder.image(key))
        .collect();
    Seeder::set_images(ctx, id, &images).await?;
    Ok(id)
}

async fn list(ctx: &mut Ctx, event: Uuid, product: Uuid, status: &str) -> AppResult<()> {
    sqlx::query(
        "INSERT INTO event_products (event_id, product_id, status) VALUES ($1, $2, $3::event_product_status)",
    )
    .bind(event)
    .bind(product)
    .bind(status)
    .execute(ctx.conn())
    .await?;
    Ok(())
}

/// insertSeedData: the events and items the end-to-end tests work with.
pub async fn insert(seeder: &Seeder, ctx: &mut Ctx, users: &CoreUsers) -> AppResult<Value> {
    let tr = |de: &'static str, en: &'static str| seeder.text(t(de, en));
    let [user1, user2, user3, user4, user5] = users.test_users;

    insert_event(seeder, ctx, EventSpec {
        title: tr("Fahrrad Flohmarkt Ulm", "Bike Flea Market Ulm"),
        description: tr(
            "Der größte Fahrradmarkt der Region! Verkauf von gebrauchten Fahrrädern, E-Bikes, Ersatzteilen und Zubehör. Kommt vorbei und findet tolle Schnäppchen rund ums Radfahren! Ob für den täglichen Weg zur Arbeit, die sportliche Tour am Wochenende oder das erste Rad für den Nachwuchs – hier wird jeder fündig. Durch die Teilnahme unterstützt du lokale Initiativen für nachhaltige Mobilität und hilfst dabei, Ressourcen zu schonen. Bring dein altes Rad mit und gib ihm ein neues Zuhause oder lass es direkt vor Ort von unseren Experten schätzen.",
            "The biggest bike market in the region! Second-hand bikes, e-bikes, spare parts and accessories. Come along and find great deals on everything cycling – for the daily commute, the weekend ride or the kids' first bike. By taking part you support local initiatives for sustainable transport and help save resources. Bring your old bike and give it a new home, or have it valued on site by our experts.",
        ),
        location: tr("Ulm Stadtmitte, Münsterplatz", "Ulm city centre, Minster Square"),
        start_offset_ms: 2 * DAY,
        end_offset_ms: 3 * DAY,
        contact_info: tr(
            "Kontakt für Rückfragen: Ulli (ulli.radler@bazarpro.de) oder telefonisch unter 0123-456789 (Mo-Fr 10-18 Uhr).",
            "Questions? Ask Ulli (ulli.radler@bazarpro.de) or call 0123-456789 (Mon–Fri 10 am–6 pm).",
        ),
        services: &["Gastronomie", "Parkplatz"],
        commission: 5,
        organizer: user1,
        cover: seeder.image("cover_bikes"),
    })
    .await?;

    insert_event(seeder, ctx, EventSpec {
        title: tr("Sommerfest & Basar", "Summer Fair & Bazaar"),
        description: tr(
            "Ein buntes Sommerfest für die ganze Familie mit integriertem Flohmarkt-Basar. Genießt leckeres Essen, Live-Musik und stöbert durch eine Vielzahl von Ständen mit Kleidung, Spielzeug, Büchern und Handgemachtem. Für die Kinder gibt es eine Hüpfburg und Kinderschminken. Der Erlös der Standgebühren wird für einen gemeinnützigen Zweck gespendet. Wir freuen uns auf einen sonnigen Tag mit euch!",
            "A colourful summer fair for the whole family with a flea market. Enjoy good food and live music and browse stalls with clothes, toys, books and handmade things. There is a bouncy castle and face painting for the kids. All stall fees go to charity. We look forward to a sunny day with you!",
        ),
        location: tr("Stadtpark Grillwiese", "City park, barbecue meadow"),
        start_offset_ms: 14 * DAY,
        end_offset_ms: 15 * DAY,
        contact_info: tr(
            "Organisationsteam Sommerfest: sommerfest@bazarpro.de",
            "Summer fair team: sommerfest@bazarpro.de",
        ),
        services: &["Getränke", "Gastronomie"],
        commission: 5,
        organizer: user2,
        cover: seeder.image("cover_rack"),
    })
    .await?;

    insert_product(seeder, ctx, ProductSpec {
        title: tr("Hochwertige Outdoor-Jacke", "High-quality outdoor jacket"),
        description: tr(
            "Verkaufe meine wenig getragene Outdoor-Jacke der Marke NorthFace in Größe L. Sie ist wind- und wasserdicht, atmungsaktiv und ideal für Wanderungen oder den täglichen Weg zur Arbeit bei schlechtem Wetter. Die Jacke hat keinerlei Beschädigungen, alle Reißverschlüsse funktionieren einwandfrei. Farbe: Dunkelblau mit orangen Akzenten. Neupreis lag bei 250€. Tierfreier Nichtraucherhaushalt.",
            "Selling my hardly worn NorthFace outdoor jacket, size L. Wind- and waterproof, breathable, ideal for hiking or commuting in bad weather. No damage, all zips work perfectly. Colour: dark blue with orange details. Cost €250 new. Pet-free, non-smoking home.",
        ),
        condition: "very-good",
        price: 85,
        vendor: user3,
        sold: false,
        images: &["jacket"],
        days_ago: 0,
    })
    .await?;

    insert_product(seeder, ctx, ProductSpec {
        title: tr("Wanderstiefel Gr. 42", "Hiking boots size 8"),
        description: tr(
            "Robuste Wanderstiefel von Meindl, Modell \"Borneo\", Größe 42. Das Leder ist gut gepflegt und wurde regelmäßig gewachst. Die Sohle hat noch ein sehr gutes Profil und bietet sicheren Halt auch in schwierigem Gelände. Ich verkaufe sie nur, weil sie mir nach einer Fußverletzung leider nicht mehr optimal passen. Perfekt für die nächste Bergtour! Einlegesohlen sind frisch gewaschen.",
            "Sturdy Meindl hiking boots, model \"Borneo\", size 8. Well looked-after leather, waxed regularly. The soles still have very good tread and grip on rough ground. Only selling because they no longer fit well after a foot injury. Perfect for your next mountain hike! Insoles freshly washed.",
        ),
        condition: "good",
        price: 60,
        vendor: user4,
        sold: false,
        images: &["boots"],
        days_ago: 0,
    })
    .await?;

    let winter = insert_event(seeder, ctx, EventSpec {
        title: tr("Großer Winterflohmarkt 2026", "Big Winter Flea Market 2026"),
        description: tr(
            "Der ultimative Treffpunkt für alle Wintersport-Begeisterten! Pünktlich zum Start der Skisaison veranstalten wir den größten Winterflohmarkt der Region im Olympiapark. Hier findest du alles, was das Herz begehrt: Von Carving-Ski und Snowboards über Schlittschuhe bis hin zu warmer Funktionskleidung und Helmen. Hunderte private Verkäufer bieten ihre gebrauchte Ausrüstung zu fairen Preisen an. Zusätzlich gibt es einen Wachs-Service vor Ort, der deine neuen Ski direkt fit für die Piste macht. Für das leibliche Wohl ist mit Glühwein, Kinderpunsch und deftigen Snacks bestens gesorgt.",
            "The place to be for everyone who loves winter sports! Just in time for the ski season we hold the region's biggest winter flea market in the Olympic Park. Carving skis and snowboards, ice skates, warm clothing and helmets – hundreds of private sellers offer their used gear at fair prices. A waxing service on site gets your new skis ready for the slopes. Mulled wine, kids' punch and hearty snacks keep you going.",
        ),
        location: tr(
            "München Olympiapark, Olympiahalle Eingang Ost",
            "Munich Olympic Park, Olympic Hall east entrance",
        ),
        start_offset_ms: 7 * DAY,
        end_offset_ms: 8 * DAY,
        contact_info: tr(
            "Veranstalter: WinterSport Events GmbH. Email: info@wintermarkt.de, Tel: 089-1234567. Standanmeldungen bitte über die Website.",
            "Organizer: WinterSport Events Ltd. Email: info@wintermarkt.de, phone: 089-1234567. Please register stalls on the website.",
        ),
        services: &["Parkplatz", "Gastronomie", "Skiservice"],
        commission: 10,
        organizer: users.admin,
        cover: seeder.image("cover_winter"),
    })
    .await?;

    let ongoing = insert_event(seeder, ctx, EventSpec {
        title: tr("Laufender Test-Bazar (AKTUELL)", "Running test bazaar (NOW)"),
        description: tr(
            "Diese Veranstaltung läuft gerade und dient zum Testen der Rabatt-Funktion. Verkäufer können hier während der Laufzeit die Preise ihrer Artikel anpassen.",
            "This bazaar is running right now and is for trying out discounts. Sellers can change the prices of their items while it runs.",
        ),
        location: tr("Test-Halle Mitte", "Test hall, centre"),
        start_offset_ms: -DAY,
        end_offset_ms: DAY,
        contact_info: "support@bazarpro.de",
        services: &["Getränke"],
        commission: 10,
        organizer: users.admin,
        cover: seeder.image("cover_bikes"),
    })
    .await?;

    let ski = insert_product(seeder, ctx, ProductSpec {
        title: tr("Atomic Carving Ski 160cm", "Atomic carving skis 160 cm"),
        description: tr(
            "Verkaufe meine treuen Atomic Redster Carving Ski in der Länge 160cm. Sie sind etwa 3 Jahre alt und wurden pro Saison ca. 1 Woche gefahren. Der Belag hat vor dem letzten Urlaub einen frischen Service bekommen (Kanten geschliffen, gewachst) und ist in einem top Zustand ohne tiefe Kratzer. Die Bindung ist natürlich dabei und voll funktionsfähig. Ideal für fortgeschrittene Fahrer, die einen sportlichen aber fehlerverzeihenden Ski suchen.",
            "Selling my trusty Atomic Redster carving skis, 160 cm. About 3 years old, used for roughly a week per season. Base and edges were serviced before the last holiday and are in top condition without deep scratches. Bindings included and fully working. Ideal for intermediate skiers who want a sporty but forgiving ski.",
        ),
        condition: "good",
        price: 120,
        vendor: users.seller,
        sold: false,
        images: &["ski", "ski_helmet"],
        days_ago: 0,
    })
    .await?;

    let helmet = insert_product(seeder, ctx, ProductSpec {
        title: tr("Uvex Skihelm Gr. M (55-59cm)", "Uvex ski helmet size M (55-59 cm)"),
        description: tr(
            "Sicherheit geht vor! Ich biete hier einen hochwertigen Skihelm der Marke Uvex in Matt-Schwarz an. Größe M, verstellbar für Kopfumfang 55-59cm. Der Helm ist sturzfrei und wurde nur eine Saison getragen, daher ist er praktisch wie neu und hat keine sichtbaren Gebrauchsspuren. Er verfügt über ein verstellbares Belüftungssystem und ein herausnehmbares, waschbares Innenfutter. Neupreis war 89€.",
            "Safety first! A high-quality Uvex ski helmet in matt black. Size M, adjustable for 55-59 cm. Never crashed and worn for one season only, so practically as new without visible signs of use. Adjustable ventilation and a removable, washable lining. Cost €89 new.",
        ),
        condition: "very-good",
        price: 45,
        vendor: users.seller,
        sold: false,
        images: &["ski_helmet", "jacket"],
        days_ago: 0,
    })
    .await?;

    let mtb = insert_product(seeder, ctx, ProductSpec {
        title: tr(
            "Mountainbike 'Rockrider' 26 Zoll",
            "Mountain bike 'Rockrider' 26 inch",
        ),
        description: tr(
            "Gut erhaltenes Mountainbike für Einsteiger. 21 Gänge, Federgabel vorne. Bremsen und Schaltung wurden erst kürzlich geprüft. Kleine Kratzer am Rahmen, aber technisch einwandfrei.",
            "Well-kept mountain bike for beginners. 21 gears, front suspension. Brakes and gears were checked recently. Small scratches on the frame, but technically perfect.",
        ),
        condition: "good",
        price: 145,
        vendor: user5,
        sold: false,
        images: &["mtb", "mtb_mountains"],
        days_ago: 0,
    })
    .await?;

    let seat = insert_product(seeder, ctx, ProductSpec {
        title: tr("Kindersitz Römer für Fahrrad", "Römer child bike seat"),
        description: tr(
            "Sicherer Kindersitz für das Fahrrad. Einfache Montage am Rahmen. Inklusive Halterung und Anschnallgurten. Der Bezug ist waschbar und in einem kräftigen Rot.",
            "Safe child seat for the bike. Easy to fit to the frame. Bracket and harness included. The cover is washable and bright red.",
        ),
        condition: "very-good",
        price: 35,
        vendor: user5,
        sold: false,
        images: &["bike_helmet"],
        days_ago: 0,
    })
    .await?;

    list(ctx, winter, ski, "available").await?;
    list(ctx, winter, helmet, "announced").await?;
    seeder.add_seller(ctx, winter, users.seller, false).await?;
    seeder.add_seller(ctx, ongoing, users.seller, false).await?;
    seeder.add_seller(ctx, ongoing, user5, false).await?;
    list(ctx, ongoing, ski, "available").await?;
    list(ctx, ongoing, mtb, "available").await?;
    list(ctx, ongoing, seat, "announced").await?;

    let past = insert_event(
        seeder,
        ctx,
        EventSpec {
            title: tr(
                "Historischer Herbst-Flohmarkt 2025",
                "Autumn Flea Market 2025 (archive)",
            ),
            description: tr(
                "Ein Rückblick auf unseren erfolgreichen Herbstmarkt vom letzten Jahr.",
                "A look back at last year's successful autumn market.",
            ),
            location: tr("Altes Rathaus, Ulm", "Old town hall, Ulm"),
            start_offset_ms: -180 * DAY,
            end_offset_ms: -179 * DAY,
            contact_info: "archiv@bazarpro.de",
            services: &["Gastronomie"],
            commission: 10,
            organizer: users.admin,
            cover: seeder.image("cover_rack"),
        },
    )
    .await?;
    seeder.add_role(ctx, past, user1, "coorganizer").await?;
    seeder.add_role(ctx, past, user2, "coorganizer").await?;
    for seller in [user3, user4, user5, users.seller] {
        seeder.add_seller(ctx, past, seller, true).await?;
    }
    let ball = insert_product(
        seeder,
        ctx,
        ProductSpec {
            title: tr("Vintage Lederball", "Vintage leather football"),
            description: tr(
                "Ein echtes Sammlerstück aus den 70ern.",
                "A real collector's item from the seventies.",
            ),
            condition: "good",
            price: 45,
            vendor: user3,
            sold: true,
            images: &["boots"],
            days_ago: 180,
        },
    )
    .await?;
    let skates = insert_product(
        seeder,
        ctx,
        ProductSpec {
            title: tr("Alte Schlittschuhe Gr. 39", "Old ice skates size 6"),
            description: tr(
                "Gut erhaltene Kufen für Einsteiger.",
                "Well-kept skates for beginners.",
            ),
            condition: "ok",
            price: 15,
            vendor: user4,
            sold: false,
            images: &["mtb"],
            days_ago: 180,
        },
    )
    .await?;
    list(ctx, past, ball, "sold").await?;
    list(ctx, past, skates, "returned").await?;
    sqlx::query(
        "INSERT INTO purchases (event_id, seller_id, product_id, total_amount, commission_amount,
           payout_amount, payout_status, payout_date, created_at)
         VALUES ($1, $2, $3, 45, 4.5, 40.5, true, $4, $4)",
    )
    .bind(past)
    .bind(user3)
    .bind(ball)
    .bind(ms(-180 * DAY, seeder.now))
    .execute(ctx.conn())
    .await?;

    let showcase = insert_feature_showcase(
        seeder,
        ctx,
        seeder.text(SHOWCASE_TITLE),
        &users.showcase,
        seeder.image("cover_bikes"),
    )
    .await?;
    Ok(json!({ "showcase": showcase.event_id }))
}
