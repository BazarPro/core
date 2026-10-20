//! The ported Convex modules, one file per convex/<module>.ts.

pub mod access;
pub mod categories;
pub mod feature_flags;
pub mod instance;
pub mod messages;
pub mod site_pages;

use crate::rpc::Registry;

pub fn register_all() -> Registry {
    let mut registry = Registry::default();
    categories::register(&mut registry);
    feature_flags::register(&mut registry);
    instance::register(&mut registry);
    messages::register(&mut registry);
    site_pages::register(&mut registry);
    registry
}
