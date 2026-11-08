//! What a helper may do at the bazaar, chosen by the organizer per helper (#47).

use crate::common;

use axum::http::StatusCode;
use common::fixtures::{self, EventSpec};
use common::{Reply, TestApp};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

const ALL: [&str; 5] = ["intake", "sale", "return", "payout", "cashSummary"];

/// A running bazaar with an organizer, a seller and a helper.
struct Team {
    app: TestApp,
    db: PgPool,
    event: Uuid,
    seller: Uuid,
    helper: Uuid,
    as_organizer: String,
    as_helper: String,
}

impl Team {
    async fn new(db: PgPool) -> Self {
        let app = TestApp::new(db.clone());
        let organizer = fixtures::user(&db, "Orga").await;
        let seller = fixtures::user(&db, "Seller").await;
        let helper = fixtures::user(&db, "Helfer").await;
        let event = fixtures::event(
            &db,
            EventSpec {
                start_hours: -1,
                end_hours: 5,
                ..EventSpec::new("Basar", organizer)
            },
        )
        .await;
        fixtures::role(&db, event, seller, "seller").await;
        fixtures::role(&db, event, helper, "seller").await;
        fixtures::role(&db, event, helper, "coorganizer").await;
        Self {
            as_organizer: fixtures::session(&db, organizer).await,
            as_helper: fixtures::session(&db, helper).await,
            app,
            db,
            event,
            seller,
            helper,
        }
    }

    async fn allow(&self, permissions: &[&str]) {
        let reply = self
            .app
            .mutation(
                "eventRoles.setHelperPermissions",
                json!({ "eventId": self.event, "userId": self.helper, "permissions": permissions }),
                Some(&self.as_organizer),
            )
            .await;
        assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    }

    async fn item(&self, status: &str) -> Uuid {
        let product = fixtures::product(&self.db, self.seller, "Ski", 20.0).await;
        fixtures::event_product(&self.db, self.event, product, status).await
    }

    async fn my_permissions(&self, session: &str) -> Value {
        self.app
            .query(
                "eventRoles.getMyPermissionsForEvent",
                json!({ "eventId": self.event }),
                Some(session),
            )
            .await
            .body["value"]
            .clone()
    }

    /// The helper does what needs the permission, on fresh data each time.
    async fn act(&self, permission: &str) -> Reply {
        let session = Some(self.as_helper.as_str());
        match permission {
            "intake" => {
                let relation = self.item("announced").await;
                self.app
                    .mutation(
                        "eventProducts.updateProductStatus",
                        json!({ "eventProductId": relation, "status": "available" }),
                        session,
                    )
                    .await
            }
            "sale" => {
                let relation = self.item("available").await;
                self.app
                    .mutation(
                        "purchases.sellProduct",
                        json!({ "eventProductId": relation }),
                        session,
                    )
                    .await
            }
            "return" => {
                self.item("available").await;
                self.app
                    .mutation(
                        "eventProducts.markAllVendorProductsReturned",
                        json!({ "eventId": self.event, "vendorId": self.seller }),
                        session,
                    )
                    .await
            }
            "payout" => {
                let reply = self
                    .app
                    .mutation(
                        "eventSeller.markVendorPayoutReceived",
                        json!({ "eventId": self.event, "vendorUserId": self.seller }),
                        session,
                    )
                    .await;
                // Paid out again for the next round
                sqlx::query("UPDATE event_sellers SET payout_received = false")
                    .execute(&self.db)
                    .await
                    .unwrap();
                reply
            }
            "cashSummary" => {
                self.app
                    .query(
                        "events.getEventFinancialSummary",
                        json!({ "eventId": self.event }),
                        session,
                    )
                    .await
            }
            other => panic!("unknown permission {other}"),
        }
    }
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn helpers_without_a_choice_may_do_everything(db: PgPool) {
    let team = Team::new(db).await;
    assert_eq!(team.my_permissions(&team.as_helper).await, json!(ALL));
    assert_eq!(team.my_permissions(&team.as_organizer).await, json!(ALL));
    for permission in ALL {
        let reply = team.act(permission).await;
        assert_eq!(reply.status, StatusCode::OK, "{permission}: {}", reply.body);
    }
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn each_permission_allows_and_refuses(db: PgPool) {
    let team = Team::new(db).await;
    for permission in ALL {
        let others: Vec<&str> = ALL.into_iter().filter(|p| *p != permission).collect();
        team.allow(&others).await;
        let refused = team.act(permission).await;
        assert_eq!(refused.status, StatusCode::FORBIDDEN, "{permission}");
        assert_eq!(refused.body["code"], format!("helper.{permission}"));

        team.allow(&[permission]).await;
        let allowed = team.act(permission).await;
        assert_eq!(
            allowed.status,
            StatusCode::OK,
            "{permission}: {}",
            allowed.body
        );
    }
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_organizer_chooses_and_sees_the_permissions(db: PgPool) {
    let team = Team::new(db.clone()).await;
    let newcomer = fixtures::user(&db, "Neu").await;
    fixtures::role(&db, team.event, newcomer, "seller").await;
    let reply = team
        .app
        .mutation(
            "eventRoles.addCoOrganizerForEvent",
            json!({ "eventId": team.event, "userId": newcomer, "permissions": ["sale", "intake"] }),
            Some(&team.as_organizer),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    let as_newcomer = fixtures::session(&db, newcomer).await;
    // Stored in a fixed order, each once
    assert_eq!(
        team.my_permissions(&as_newcomer).await,
        json!(["intake", "sale"])
    );

    let vendors = team
        .app
        .query(
            "eventRoles.getVendorsForEvent",
            json!({ "eventId": team.event }),
            Some(&team.as_organizer),
        )
        .await
        .body["value"]
        .clone();
    let of = |user: Uuid| {
        vendors
            .as_array()
            .unwrap()
            .iter()
            .find(|v| v["_id"] == json!(user))
            .unwrap()["helperPermissions"]
            .clone()
    };
    assert_eq!(of(newcomer), json!(["intake", "sale"]));
    assert_eq!(of(team.helper), json!(ALL));
    assert_eq!(of(team.seller), Value::Null);

    // Only the organizer chooses, and only for helpers
    let set = |user: Uuid, session: String| {
        let app = &team.app;
        let event = team.event;
        async move {
            app.mutation(
                "eventRoles.setHelperPermissions",
                json!({ "eventId": event, "userId": user, "permissions": [] }),
                Some(&session),
            )
            .await
            .body["code"]
                .clone()
        }
    };
    assert_eq!(
        set(newcomer, team.as_helper.clone()).await,
        "auth.forbidden"
    );
    assert_eq!(
        set(team.seller, team.as_organizer.clone()).await,
        "seller.notHelper"
    );

    // Without any permission the helper still belongs to the team, but may do nothing
    team.allow(&[]).await;
    assert_eq!(team.my_permissions(&team.as_helper).await, json!([]));
    let roles = team
        .app
        .query(
            "eventRoles.getMyRolesForEvent",
            json!({ "eventId": team.event }),
            Some(&team.as_helper),
        )
        .await;
    assert_eq!(roles.body["value"], json!(["seller", "coorganizer"]));
    // Outside the team: nothing
    let stranger = fixtures::user(&db, "Fremd").await;
    let as_stranger = fixtures::session(&db, stranger).await;
    assert_eq!(team.my_permissions(&as_stranger).await, json!([]));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn taking_a_returned_item_back_belongs_to_the_return(db: PgPool) {
    let team = Team::new(db).await;
    team.allow(&["intake"]).await;
    let returned = team.item("returned").await;
    let back = |relation: Uuid| {
        let team = &team;
        async move {
            team.app
                .mutation(
                    "eventProducts.updateProductStatus",
                    json!({ "eventProductId": relation, "status": "available" }),
                    Some(&team.as_helper),
                )
                .await
        }
    };
    assert_eq!(back(returned).await.body["code"], "helper.return");
    team.allow(&["return"]).await;
    assert_eq!(back(returned).await.status, StatusCode::OK);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn offline_intake_of_a_helper_without_the_right_is_refused(db: PgPool) {
    let team = Team::new(db.clone()).await;
    team.allow(&["sale"]).await;
    let relation = team.item("announced").await;
    let action = Uuid::new_v4();
    let reply = team
        .app
        .mutation(
            "offline.replay",
            json!({ "eventId": team.event, "actions": [{
                "id": action,
                "name": "eventProducts.updateProductStatus",
                "args": { "eventProductId": relation, "status": "available" },
                "label": "Ski",
                "doneAt": 1_700_000_000_000_i64,
            }] }),
            Some(&team.as_helper),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(reply.body["value"][0]["error"], "helper.intake");
    let status: String =
        sqlx::query_scalar("SELECT status::text FROM event_products WHERE id = $1")
            .bind(relation)
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(status, "announced");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn settling_a_seller_with_unsold_items_also_needs_the_return(db: PgPool) {
    let team = Team::new(db.clone()).await;
    team.allow(&["payout"]).await;
    let unsold = team.item("available").await;
    let settle = || {
        team.app.mutation(
            "eventSeller.settleVendor",
            json!({ "eventId": team.event, "vendorUserId": team.seller }),
            Some(&team.as_helper),
        )
    };
    let refused = settle().await;
    assert_eq!(refused.body["code"], "helper.return", "{}", refused.body);
    let status: String =
        sqlx::query_scalar("SELECT status::text FROM event_products WHERE id = $1")
            .bind(unsold)
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(status, "available");

    // Nothing left to give back: the payout right is enough
    sqlx::query("UPDATE event_products SET status = 'returned' WHERE id = $1")
        .bind(unsold)
        .execute(&db)
        .await
        .unwrap();
    let settled = settle().await;
    assert_eq!(settled.status, StatusCode::OK, "{}", settled.body);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn appointing_a_helper_again_sets_the_permissions_anew(db: PgPool) {
    let team = Team::new(db).await;
    team.allow(&["intake"]).await;
    let reply = team
        .app
        .mutation(
            "eventRoles.addCoOrganizerForEvent",
            json!({ "eventId": team.event, "userId": team.helper }),
            Some(&team.as_organizer),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(team.my_permissions(&team.as_helper).await, json!(ALL));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_stale_intake_is_told_the_item_changed(db: PgPool) {
    let team = Team::new(db).await;
    team.allow(&["intake"]).await;
    // Accepted offline while announced; meanwhile returned at another device
    let relation = team.item("returned").await;
    let reply = team
        .app
        .mutation(
            "eventProducts.updateProductStatus",
            json!({ "eventProductId": relation, "status": "available", "fromStatus": "announced" }),
            Some(&team.as_helper),
        )
        .await;
    assert_eq!(
        reply.body["code"], "product.statusChanged",
        "{}",
        reply.body
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_cart_without_the_cash_desk_names_the_missing_right(db: PgPool) {
    let team = Team::new(db).await;
    team.allow(&["intake"]).await;
    let first = team.item("available").await;
    let second = team.item("available").await;
    let reply = team
        .app
        .mutation(
            "purchases.sellProducts",
            json!({ "items": [{ "eventProductId": first }, { "eventProductId": second }] }),
            Some(&team.as_helper),
        )
        .await;
    assert_eq!(reply.status, StatusCode::FORBIDDEN, "{}", reply.body);
    assert_eq!(reply.body["code"], "helper.sale");
}
