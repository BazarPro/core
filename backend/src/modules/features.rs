//! Per-event feature switches chosen by the organizer.

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::Deserialize;
use serde_json::Value;

use super::docs::Event;
use crate::money::Cents;
use crate::shape::from_ms;

/// Highest discount a seller may ever grant, regardless of the event setting.
pub const MAX_DISCOUNT_PERCENT: u32 = 50;

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
    label_format: Option<String>,
    price_on_label: Option<bool>,
    label_mark: Option<String>,
    intake_fee: Option<f64>,
    private_sellers_only: Option<bool>,
    fixed_seller_data: Option<bool>,
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
    pub label_format: String,
    pub price_on_label: bool,
    /// What tells the sellers' items apart on labels: see `label_mark`
    pub label_mark: String,
    /// Fixed fee in € per accepted item, kept from the payout
    pub intake_fee: Option<Decimal>,
    pub private_sellers_only: bool,
    pub fixed_seller_data: bool,
}

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
        private_sellers_only: stored.private_sellers_only.unwrap_or(false),
        fixed_seller_data: stored.fixed_seller_data.unwrap_or(false),
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

/// Labels show the price only without discounts: a discount would make it wrong.
pub fn shows_price_on_label(event: &Event) -> bool {
    let features = event.resolved_features();
    features.price_on_label && !features.discounts
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
