//! Per-event feature switches chosen by the organizer.

use std::collections::BTreeMap;

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::Value;

use super::docs::Event;
use crate::money::Cents;
use crate::shape::from_ms;

/// Highest discount a seller may ever grant, regardless of the event setting.
pub const MAX_DISCOUNT_PERCENT: u32 = 50;

/// Countries of addresses and postal code regions (ISO 3166-1 alpha-2), in this order.
pub const COUNTRIES: [&str; 5] = ["DE", "AT", "CH", "LI", "LU"];

/// `features` as stored; absent fields take the defaults below.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Stored {
    discounts: Option<bool>,
    discount_starts_at: Option<f64>,
    max_discount_percent: Option<f64>,
    price_offers: Option<bool>,
    minimum_price: Option<bool>,
    questions: Option<bool>,
    questions_during_event_only: Option<bool>,
    photos_optional: Option<bool>,
    public_catalog: Option<bool>,
    required_fields: Option<Vec<String>>,
    max_items_per_seller: Option<f64>,
    max_items_total: Option<f64>,
    label_format: Option<String>,
    price_on_label: Option<bool>,
    label_mark: Option<String>,
    intake_fee: Option<f64>,
    max_fees_per_seller: Option<f64>,
    private_sellers_only: Option<bool>,
    fixed_seller_data: Option<bool>,
    direct_sale: Option<bool>,
    registration_open: Option<bool>,
    registration_starts_at: Option<f64>,
    registration_ends_at: Option<f64>,
    fee_groups: Option<Vec<StoredFeeGroup>>,
    /// `{"DE": ["89"], "AT": ["6"]}`
    allowed_postal_codes: Option<BTreeMap<String, Vec<String>>>,
}

/// A fee group as stored in `features.feeGroups` (#302).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredFeeGroup {
    id: String,
    label: String,
    commission: f64,
    intake_fee: Option<f64>,
    max_fees_per_seller: Option<f64>,
    max_items_per_seller: Option<f64>,
    assignment: FeeGroupAssignment,
    proof_hint: Option<String>,
}

/// How a seller gets into a fee group.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FeeGroupAssignment {
    /// The seller says so when joining; the team checks it at the intake
    SelfDeclared,
    /// Everyone with a helper role at the bazaar, and whom the team puts in by hand.
    /// At most one group per bazaar.
    Helpers,
    /// Only whom the team puts in by hand; sellers can neither choose nor see it as choice
    Manual,
}

/// Sellers with own fees instead of the bazaar's, e.g. club members or helpers (#302).
/// Each group has its own fees, not a discount: "5 % instead of 10 %".
#[derive(Debug, Clone, PartialEq)]
pub struct FeeGroup {
    pub id: String,
    /// Chosen by the organizer, e.g. "Vereinsmitglieder"
    pub label: String,
    /// Percent of each sale
    pub commission: Decimal,
    /// € per accepted item; none: no intake fee
    pub intake_fee: Option<Decimal>,
    /// Own fee cap; none: the bazaar's
    pub max_fees_per_seller: Option<Decimal>,
    /// Own item limit per seller; none: the bazaar's
    pub max_items_per_seller: Option<u32>,
    pub assignment: FeeGroupAssignment,
    /// Shown to sellers, e.g. "Mitgliedsausweis bei der Abgabe zeigen"
    pub proof_hint: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EventFeatures {
    pub discounts: bool,
    pub discount_starts_at: Option<DateTime<Utc>>,
    pub max_discount_percent: u32,
    pub price_offers: bool,
    pub minimum_price: bool,
    pub questions: bool,
    pub questions_during_event_only: bool,
    pub photos_optional: bool,
    /// Visitors see the items online before and during the bazaar. Off: the label's QR code
    /// still opens the item's price page, but nothing lists the items.
    pub public_catalog: bool,
    pub required_fields: Vec<String>,
    pub max_items_per_seller: Option<u32>,
    /// Items of all sellers together, e.g. what the hall holds
    pub max_items_total: Option<u32>,
    pub label_format: String,
    pub price_on_label: bool,
    /// What tells the sellers' items apart on labels: see `label_mark`
    pub label_mark: String,
    /// Fixed fee in € per accepted item, kept from the payout
    pub intake_fee: Option<Decimal>,
    /// Upper bound in € of all fees one seller pays (commission and intake fee)
    pub max_fees_per_seller: Option<Decimal>,
    pub private_sellers_only: bool,
    pub fixed_seller_data: bool,
    /// Buyers pay the seller at the item; the cash desk books the sale and takes only the
    /// commission from the seller, so nothing is paid out after the bazaar
    pub direct_sale: bool,
    /// Sellers may join; off, only invited people get in
    pub registration_open: bool,
    /// Joining is possible from / until then; either may be missing
    pub registration_starts_at: Option<DateTime<Utc>>,
    pub registration_ends_at: Option<DateTime<Utc>>,
    /// Sellers with own fees (#302); see `fee_groups`
    pub fee_groups: Vec<FeeGroup>,
    /// Only sellers from these postal codes join on their own (#304); none: everyone
    pub postal_codes: Option<PostalCodes>,
}

/// The region of a bazaar: postal codes that start with one of the prefixes of their
/// country, e.g. "89" or "7322" in Germany and "6" in Austria (#304).
#[derive(Debug, Clone, PartialEq)]
pub struct PostalCodes {
    /// ISO 3166-1 alpha-2, e.g. "DE", with its prefixes; in the order of `COUNTRIES`
    pub countries: Vec<(String, Vec<String>)>,
}

/// Digits of a postal code: "L-1234" in Luxembourg is "1234".
pub fn postal_code_digits(code: &str) -> String {
    code.chars().filter(char::is_ascii_digit).collect()
}

/// The country of a profile as a code; profiles without one are from Germany, like the
/// address of a bazaar. Older profiles may hold the name ("Deutschland").
pub fn profile_country(country: Option<&str>) -> String {
    let Some(country) = country.map(str::trim).filter(|country| !country.is_empty()) else {
        return "DE".to_owned();
    };
    let upper = country.to_uppercase();
    match upper.as_str() {
        "DEUTSCHLAND" | "GERMANY" => "DE",
        "ÖSTERREICH" | "AUSTRIA" => "AT",
        "SCHWEIZ" | "SWITZERLAND" => "CH",
        "LUXEMBURG" | "LUXEMBOURG" => "LU",
        "LIECHTENSTEIN" => "LI",
        _ => &upper,
    }
    .to_owned()
}

impl PostalCodes {
    /// Whether a seller with this postal code and country is from the region.
    pub fn admits(&self, postal_code: &str, country: Option<&str>) -> bool {
        let digits = postal_code_digits(postal_code);
        let country = profile_country(country);
        self.countries
            .iter()
            .filter(|(code, _)| *code == country)
            .flat_map(|(_, prefixes)| prefixes)
            .any(|prefix| digits.starts_with(prefix.as_str()))
    }

    /// "89…, 7322… (DE), 6… (AT)" for messages; after `DESCRIBED_PREFIXES` codes the rest
    /// as "+N", as the app shows it.
    pub fn describe(&self) -> String {
        let mut left = DESCRIBED_PREFIXES;
        let mut hidden = 0;
        let mut parts = Vec::new();
        for (country, prefixes) in &self.countries {
            let shown = prefixes.len().min(left);
            left -= shown;
            hidden += prefixes.len() - shown;
            if shown == 0 {
                continue;
            }
            let codes: Vec<String> = prefixes[..shown].iter().map(|p| format!("{p}…")).collect();
            parts.push(format!("{} ({country})", codes.join(", ")));
        }
        let text = parts.join(", ");
        if hidden > 0 {
            format!("{text} +{hidden}")
        } else {
            text
        }
    }
}

/// How many postal codes a message names; the app's list stops there too
const DESCRIBED_PREFIXES: usize = 12;

/// Events created before features existed keep their old behaviour: discounts on (up to
/// 50 %), everything else off.
pub fn resolve(features: Option<&Value>) -> EventFeatures {
    let stored: Stored = features
        .and_then(|value| serde_json::from_value(value.clone()).ok())
        .unwrap_or_default();
    let max = stored
        .max_discount_percent
        .map_or(MAX_DISCOUNT_PERCENT as f64, f64::round)
        .clamp(1.0, MAX_DISCOUNT_PERCENT as f64) as u32;
    EventFeatures {
        discounts: stored.discounts.unwrap_or(true),
        discount_starts_at: stored.discount_starts_at.and_then(from_ms),
        max_discount_percent: max,
        price_offers: stored.price_offers.unwrap_or(false),
        minimum_price: stored.minimum_price.unwrap_or(false),
        questions: stored.questions.unwrap_or(false),
        questions_during_event_only: stored.questions_during_event_only.unwrap_or(false),
        photos_optional: stored.photos_optional.unwrap_or(false),
        public_catalog: stored.public_catalog.unwrap_or(true),
        required_fields: stored.required_fields.unwrap_or_default(),
        max_items_per_seller: stored.max_items_per_seller.map(|n| n.max(0.0) as u32),
        max_items_total: stored.max_items_total.map(|n| n.max(0.0) as u32),
        label_format: stored.label_format.unwrap_or_else(|| "standard".to_owned()),
        price_on_label: stored.price_on_label.unwrap_or(false),
        // Older bazaars may have stored the seller number, which labels no longer show
        label_mark: match stored.label_mark.as_deref() {
            Some("none") => "none".to_owned(),
            _ => "universal".to_owned(),
        },
        intake_fee: stored
            .intake_fee
            .and_then(Decimal::from_f64_retain)
            .map(|fee| fee.cents()),
        max_fees_per_seller: stored
            .max_fees_per_seller
            .and_then(Decimal::from_f64_retain)
            .map(|cap| cap.max(Decimal::ZERO).cents()),
        private_sellers_only: stored.private_sellers_only.unwrap_or(false),
        fixed_seller_data: stored.fixed_seller_data.unwrap_or(false),
        direct_sale: stored.direct_sale.unwrap_or(false),
        registration_open: stored.registration_open.unwrap_or(true),
        registration_starts_at: stored.registration_starts_at.and_then(from_ms),
        registration_ends_at: stored.registration_ends_at.and_then(from_ms),
        fee_groups: stored
            .fee_groups
            .unwrap_or_default()
            .into_iter()
            .map(|group| FeeGroup {
                id: group.id,
                label: group.label,
                commission: Decimal::from_f64_retain(group.commission)
                    .unwrap_or_default()
                    .max(Decimal::ZERO)
                    .round_dp(2),
                intake_fee: group
                    .intake_fee
                    .and_then(Decimal::from_f64_retain)
                    .map(|fee| fee.max(Decimal::ZERO).cents())
                    .filter(|fee| !fee.is_zero()),
                max_fees_per_seller: group
                    .max_fees_per_seller
                    .and_then(Decimal::from_f64_retain)
                    .map(|cap| cap.max(Decimal::ZERO).cents()),
                max_items_per_seller: group.max_items_per_seller.map(|n| n.max(0.0) as u32),
                assignment: group.assignment,
                proof_hint: group.proof_hint,
            })
            .collect(),
        postal_codes: stored.allowed_postal_codes.and_then(|stored| {
            let countries: Vec<(String, Vec<String>)> = COUNTRIES
                .iter()
                .filter_map(|&country| {
                    let prefixes: Vec<String> = stored
                        .get(country)?
                        .iter()
                        .map(|prefix| postal_code_digits(prefix))
                        .filter(|prefix| !prefix.is_empty())
                        .collect();
                    (!prefixes.is_empty()).then(|| (country.to_owned(), prefixes))
                })
                .collect();
            (!countries.is_empty()).then_some(PostalCodes { countries })
        }),
    }
}

/// Why a seller with this profile may not join a bazaar limited to a region; None when
/// they may. Without a postal code in the profile the app asks for it first.
pub fn postal_code_refused(
    features: &EventFeatures,
    postal_code: Option<&str>,
    country: Option<&str>,
) -> Option<&'static str> {
    let region = features.postal_codes.as_ref()?;
    match postal_code.map(str::trim).filter(|code| !code.is_empty()) {
        None => Some("join.postalCodeMissing"),
        Some(code) if !region.admits(code, country) => Some("join.postalCode"),
        Some(_) => None,
    }
}

impl Event {
    pub fn resolved_features(&self) -> EventFeatures {
        resolve(self.features.as_ref())
    }

    /// "Turnhalle Nord, Hauptstr. 5, 89073 Ulm" (formatEventPlace in the app).
    pub fn place(&self) -> String {
        format_place(
            &self.location,
            self.street.as_deref(),
            self.postal_code.as_deref(),
            self.city.as_deref(),
        )
    }
}

/// Whether `part` stands in `text` as whole words: "Ulm" is not in "Ulmer Halle".
fn contains_words(text: &str, part: &str) -> bool {
    let text = text.to_lowercase();
    let part = part.to_lowercase();
    text.match_indices(&part).any(|(start, _)| {
        let before = text[..start].chars().next_back();
        let after = text[start + part.len()..].chars().next();
        !before.is_some_and(char::is_alphanumeric) && !after.is_some_and(char::is_alphanumeric)
    })
}

fn format_place(
    location: &str,
    street: Option<&str>,
    postal_code: Option<&str>,
    city: Option<&str>,
) -> String {
    let location = location.trim();
    let town = [postal_code, city]
        .into_iter()
        .flatten()
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    let mut parts = vec![location.to_owned()];
    for part in [street.unwrap_or_default().trim(), town.as_str()] {
        if !part.is_empty() && !contains_words(location, part) {
            parts.push(part.to_owned());
        }
    }
    parts.retain(|part| !part.is_empty());
    parts.join(", ")
}

/// Whether questions on items of this event can be asked right now.
pub fn are_questions_open(event: &Event, now: DateTime<Utc>) -> bool {
    let features = event.resolved_features();
    features.questions
        && (!features.questions_during_event_only
            || (event.start_date <= now && now <= event.end_date))
}

/// Why a seller may not change discounts right now; None when allowed.
pub fn discount_unavailable(event: &Event, now: DateTime<Utc>) -> Option<&'static str> {
    let features = event.resolved_features();
    if !features.discounts {
        return Some("discount.none");
    }
    if now < event.start_date || now > event.end_date {
        return Some("discount.notRunning");
    }
    if features.discount_starts_at.is_some_and(|start| now < start) {
        return Some("discount.notYet");
    }
    None
}

/// Why sellers cannot join on their own right now; None when they can. An invitation
/// still lets someone in (#252). Over is checked before: nobody joins a past bazaar.
pub fn registration_unavailable(event: &Event, now: DateTime<Utc>) -> Option<&'static str> {
    let features = event.resolved_features();
    if !features.registration_open {
        return Some("join.closed");
    }
    if features
        .registration_starts_at
        .is_some_and(|start| now < start)
    {
        return Some("join.notYet");
    }
    if features.registration_ends_at.is_some_and(|end| now >= end) {
        return Some("join.closed");
    }
    None
}

/// Price after a seller discount.
pub fn discounted_price(price: Decimal, discount_percent: Option<Decimal>) -> Decimal {
    match discount_percent {
        Some(percent) if !percent.is_zero() => {
            price * (Decimal::ONE - percent / Decimal::ONE_HUNDRED)
        }
        _ => price,
    }
}

/// Online price offers only for items at the bazaar (available) while the event runs.
pub fn are_offers_open(status: &str, event: &Event, now: DateTime<Utc>) -> bool {
    status == "available" && event.start_date <= now && now <= event.end_date
}

/// The seller's mark on the labels of this bazaar: `universal` (the seller's lasting sorting
/// code) or `none`.
pub fn label_mark(event: &Event) -> String {
    event.resolved_features().label_mark
}

/// Whether the labels show the price. With discounts it is the starting price: buyers see
/// it without scanning, the cash desk takes the discount off (#327).
pub fn shows_price_on_label(event: &Event) -> bool {
    event.resolved_features().price_on_label
}

/// An event with these features, for tests
#[cfg(test)]
pub fn tests_event(features: Value) -> Event {
    Event {
        id: uuid::Uuid::nil(),
        created_at: Utc::now(),
        title: String::new(),
        description: String::new(),
        cover_image: None,
        event_map_image: None,
        region_map_image: None,
        location: String::new(),
        street: None,
        postal_code: None,
        city: None,
        country: None,
        start_date: Utc::now(),
        end_date: Utc::now(),
        contact_info: String::new(),
        categories: Vec::new(),
        services: Vec::new(),
        visibility: "public".into(),
        is_approved: None,
        approval_status: None,
        approved_at: None,
        approved_by: None,
        rejected_at: None,
        rejected_by: None,
        rejection_reason: None,
        access_code: None,
        vendor_limit: None,
        seller_count: None,
        last_seller_number: None,
        commission: Decimal::ZERO,
        sale_fee_fixed: None,
        sale_fee_percentage: None,
        features: Some(features),
        seller_logistics: None,
        reminders_sent: None,
        moderation: None,
        organizer_id: uuid::Uuid::nil(),
        leftovers_returned_at: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn old_events_keep_discounts_and_nothing_else() {
        let features = resolve(None);
        assert!(features.discounts);
        assert_eq!(features.max_discount_percent, 50);
        assert!(!features.price_offers && !features.questions && !features.fixed_seller_data);
        assert!(!features.direct_sale);
        assert_eq!(features.label_format, "standard");
        assert_eq!(features.label_mark, "universal");
    }

    #[test]
    fn the_discount_limit_stays_between_1_and_50() {
        assert_eq!(
            resolve(Some(&json!({ "maxDiscountPercent": 80 }))).max_discount_percent,
            50
        );
        assert_eq!(
            resolve(Some(&json!({ "maxDiscountPercent": 0 }))).max_discount_percent,
            1
        );
        assert_eq!(
            resolve(Some(&json!({ "maxDiscountPercent": 19.6 }))).max_discount_percent,
            20
        );
    }

    #[test]
    fn the_place_names_venue_and_address_once() {
        assert_eq!(
            format_place(
                "Turnhalle Nord",
                Some("Hauptstr. 5"),
                Some("89073"),
                Some("Ulm")
            ),
            "Turnhalle Nord, Hauptstr. 5, 89073 Ulm"
        );
        assert_eq!(
            format_place(
                "Halle, Hauptstr. 5, 89073 Ulm",
                Some("hauptstr. 5"),
                Some("89073"),
                Some("Ulm")
            ),
            "Halle, Hauptstr. 5, 89073 Ulm"
        );
        // Only whole words count as already there
        assert_eq!(
            format_place("Ulmer Stadthalle", None, None, Some("Ulm")),
            "Ulmer Stadthalle, Ulm"
        );
        assert_eq!(
            format_place("Halle, Hauptstr. 50", Some("Hauptstr. 5"), None, None),
            "Halle, Hauptstr. 50, Hauptstr. 5"
        );
    }

    fn event_with(features: Value) -> Event {
        super::tests_event(features)
    }

    #[test]
    fn registration_follows_the_switch_and_the_window() {
        let now = DateTime::from_timestamp(1_800_000_000, 0).unwrap();
        let ms = |hours: i64| (now.timestamp() + hours * 3600) as f64 * 1000.0;
        assert_eq!(registration_unavailable(&event_with(json!({})), now), None);
        assert_eq!(
            registration_unavailable(&event_with(json!({ "registrationOpen": false })), now),
            Some("join.closed")
        );
        let window = |start: Option<f64>, end: Option<f64>| {
            event_with(json!({ "registrationStartsAt": start, "registrationEndsAt": end }))
        };
        assert_eq!(
            registration_unavailable(&window(Some(ms(1)), None), now),
            Some("join.notYet")
        );
        assert_eq!(
            registration_unavailable(&window(None, Some(ms(-1))), now),
            Some("join.closed")
        );
        // The end itself is closed already
        assert_eq!(
            registration_unavailable(&window(None, Some(ms(0))), now),
            Some("join.closed")
        );
        assert_eq!(
            registration_unavailable(&window(Some(ms(-1)), Some(ms(1))), now),
            None
        );
    }

    #[test]
    fn the_region_admits_postal_codes_of_its_countries() {
        let features = resolve(Some(&json!({
            "allowedPostalCodes": { "DE": ["89", "7322"] }
        })));
        let refused = |code: Option<&str>, country: Option<&str>| {
            postal_code_refused(&features, code, country)
        };
        assert_eq!(refused(Some("89073"), Some("DE")), None);
        assert_eq!(refused(Some(" 73223 "), Some("de")), None);
        // Profiles without a country are from Germany, older ones may name it
        assert_eq!(refused(Some("89073"), None), None);
        assert_eq!(refused(Some("89073"), Some("Deutschland")), None);
        assert_eq!(refused(Some("88400"), Some("DE")), Some("join.postalCode"));
        assert_eq!(refused(Some("8900"), Some("AT")), Some("join.postalCode"));
        assert_eq!(refused(None, Some("DE")), Some("join.postalCodeMissing"));
        assert_eq!(
            refused(Some("  "), Some("DE")),
            Some("join.postalCodeMissing")
        );
        // Luxembourg writes "L-" in front
        let luxembourg = resolve(Some(&json!({
            "allowedPostalCodes": { "LU": ["49"] }
        })));
        assert_eq!(
            postal_code_refused(&luxembourg, Some("L-4968"), Some("LU")),
            None
        );
        // A region across the border: each country with its own prefixes
        let border = resolve(Some(&json!({
            "allowedPostalCodes": { "AT": ["69"], "DE": ["88"], "FR": ["67"] }
        })));
        let admitted = |code: &str, country: &str| {
            postal_code_refused(&border, Some(code), Some(country)).is_none()
        };
        assert!(admitted("88131", "DE"));
        assert!(admitted("6900", "Österreich"));
        assert!(!admitted("6900", "DE"));
        assert!(!admitted("88131", "AT"));
        // Countries without a map are ignored
        assert!(!admitted("67000", "FR"));
        assert_eq!(
            border.postal_codes.unwrap().describe(),
            "88… (DE), 69… (AT)"
        );
        // No region: everyone
        assert_eq!(postal_code_refused(&resolve(None), None, None), None);
        assert_eq!(features.postal_codes.unwrap().describe(), "89…, 7322… (DE)");
        // A long list stops after a dozen codes, as in the app
        let many = PostalCodes {
            countries: vec![
                ("DE".into(), (10..20).map(|n| n.to_string()).collect()),
                ("AT".into(), (60..65).map(|n| n.to_string()).collect()),
            ],
        };
        assert_eq!(
            many.describe(),
            "10…, 11…, 12…, 13…, 14…, 15…, 16…, 17…, 18…, 19… (DE), 60…, 61… (AT) +3"
        );
    }

    #[test]
    fn the_label_shows_the_starting_price_also_with_discounts() {
        // #327: buyers at a kids' bazaar read the price without scanning
        let with_discounts = tests_event(json!({ "priceOnLabel": true, "discounts": true }));
        assert!(shows_price_on_label(&with_discounts));
        let without = tests_event(json!({ "priceOnLabel": false }));
        assert!(!shows_price_on_label(&without));
    }

    #[test]
    fn discounted_prices() {
        assert_eq!(
            discounted_price(Decimal::new(2000, 2), Some(Decimal::new(25, 0))),
            Decimal::new(1500, 2)
        );
        assert_eq!(
            discounted_price(Decimal::new(2000, 2), None),
            Decimal::new(2000, 2)
        );
    }
}
