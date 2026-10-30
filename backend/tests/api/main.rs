//! The integration tests as one binary: linked once instead of once per file, and all
//! tests run in parallel (separate binaries run one after the other). tests/pool.rs
//! stays a binary of its own, see there.

#[path = "../common/mod.rs"]
mod common;

mod account_deletion;
mod auth;
mod broadcasts;
mod categories;
mod demo;
mod event_roles;
mod event_seller;
mod events;
mod import;
mod infrastructure;
mod instance;
mod moderation;
mod notifications;
mod offers;
mod offline;
mod product_questions;
mod products;
mod purchases;
mod query_cache;
mod reminders;
mod retention;
mod sale_snapshots;
mod seed;
mod site_pages;
mod storage;
mod users;
mod walk_in_sellers;
