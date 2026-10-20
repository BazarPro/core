//! The ported Convex modules, one file per convex/<module>.ts.

pub mod access;
pub mod berlin_time;
pub mod categories;
pub mod category_fields;
pub mod docs;
pub mod event_location_categories;
pub mod event_products;
pub mod event_roles;
pub mod event_seller;
pub mod events;
pub mod feature_flags;
pub mod features;
pub mod instance;
pub mod messages;
pub mod moderation;
pub mod notifications;
pub mod offers;
pub mod products;
pub mod purchases;
pub mod sales;
pub mod seller_numbers;
pub mod seller_records;
pub mod site_pages;
pub mod users;

use crate::rpc::Registry;

pub fn register_all() -> Registry {
    let mut registry = Registry::default();
    categories::register(&mut registry);
    event_location_categories::register(&mut registry);
    event_products::register(&mut registry);
    event_roles::register(&mut registry);
    event_seller::register(&mut registry);
    events::register(&mut registry);
    feature_flags::register(&mut registry);
    instance::register(&mut registry);
    messages::register(&mut registry);
    notifications::register(&mut registry);
    products::register(&mut registry);
    purchases::register(&mut registry);
    seller_numbers::register(&mut registry);
    seller_records::register(&mut registry);
    site_pages::register(&mut registry);
    users::register(&mut registry);
    registry
}
