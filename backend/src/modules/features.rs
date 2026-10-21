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
    required_fields: Option<Vec<String>>,
    max_items_per_seller: Option<f64>,
    label_format: Option<String>,
    price_on_label: Option<bool>,
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
    pub required_fields: Vec<String>,
    pub max_items_per_seller: Option<u32>,
    pub label_format: String,
    pub price_on_label: bool,
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
        required_fields: stored.required_fields.unwrap_or_default(),
        max_items_per_seller: stored.max_items_per_seller.map(|n| n.max(0.0) as u32),
        label_format: stored.label_format.unwrap_or_else(|| "standard".to_owned()),
        price_on_label: stored.price_on_label.unwrap_or(false),
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
