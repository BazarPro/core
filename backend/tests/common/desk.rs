//! A cash desk for the tests of sales (tests/api/purchases.rs, tests/desk_timing.rs).

use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

use super::fixtures::{self, EventSpec};
use super::{Reply, TestApp};

/// A bazaar with a seller, a cash desk team and helpers to sell its items.
pub struct Desk {
    pub app: TestApp,
    pub db: PgPool,
    pub event: Uuid,
    pub team: String,
    pub seller: Uuid,
}

impl Desk {
    pub async fn new(db: PgPool, features: Value) -> Self {
        let app = TestApp::new(db.clone());
        let organizer = fixtures::user(&db, "Orga").await;
        let event = fixtures::event(
            &db,
            EventSpec {
                start_hours: -1,
                end_hours: 5,
                commission: 10,
                features,
                ..EventSpec::new("Basar", organizer)
            },
        )
        .await;
        let seller = fixtures::user(&db, "Seller").await;
        fixtures::role(&db, event, seller, "seller").await;
        Self {
            team: fixtures::session(&db, organizer).await,
            app,
            db,
            event,
            seller,
        }
    }

    /// An item of the seller handed in at the event; returns (product, event product).
    pub async fn item(&self, title: &str, price: f64) -> (Uuid, Uuid) {
        self.item_of(self.seller, title, price).await
    }

    pub async fn item_of(&self, seller: Uuid, title: &str, price: f64) -> (Uuid, Uuid) {
        let product = fixtures::product(&self.db, seller, title, price).await;
        let relation = fixtures::event_product(&self.db, self.event, product, "available").await;
        (product, relation)
    }

    pub async fn sell(&self, args: Value) -> Reply {
        self.app
            .mutation("purchases.sellProduct", args, Some(&self.team))
            .await
    }

    pub async fn cart(&self, items: Value, buyer: Option<&str>) -> Reply {
        let mut args = json!({ "items": items });
        if let Some(buyer) = buyer {
            args["buyerEmail"] = json!(buyer);
        }
        self.app
            .mutation("purchases.sellProducts", args, Some(&self.team))
            .await
    }

    pub async fn purchase(
        &self,
        product: Uuid,
    ) -> Option<(f64, f64, f64, Option<String>, Option<f64>)> {
        sqlx::query_as(
            "SELECT total_amount::float8, commission_amount::float8, payout_amount::float8, price_source::text,
                    discount_percent::float8
             FROM purchases WHERE product_id = $1",
        )
        .bind(product)
        .fetch_optional(&self.db)
        .await
        .unwrap()
    }

    pub async fn mails(&self) -> Vec<(String, String)> {
        self.app.run_jobs().await;
        let mut mails: Vec<(String, String)> = self
            .app
            .sent
            .lock()
            .unwrap()
            .iter()
            .map(|m| (m.to.clone(), m.subject.clone()))
            .collect();
        mails.sort();
        mails
    }
}
