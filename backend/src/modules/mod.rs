//! The ported Convex modules, one file per convex/<module>.ts.

pub mod access;
pub mod categories;
pub mod feature_flags;

use crate::rpc::Registry;

pub fn register_all() -> Registry {
    let mut registry = Registry::default();
    categories::register(&mut registry);
    feature_flags::register(&mut registry);
    registry
}
