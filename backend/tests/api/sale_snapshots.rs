//! Sales and seller rows keep what the settlement needs (#167): title, category and
//! seller number of the sale, name and address of the seller.

use crate::common;

use axum::http::StatusCode;
use bazarpro_backend::modules::seller_records::backfill_snapshots;
use common::desk::Desk;
use common::fixtures;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

async fn exec(db: &PgPool, sql: &str, id: Uuid) {
    sqlx::query(sqlx::AssertSqlSafe(sql))
        .bind(id)
        .execute(db)
        .await
        .unwrap();
}

/// A desk whose seller has a seller row (number 7) and a full profile.
async fn desk(db: &PgPool, features: Value) -> Desk {
    let desk = Desk::new(db.clone(), features).await;
    fixtures::event_seller(db, desk.event, desk.seller, 7, false).await;
    exec(
        db,
        "UPDATE users SET first_name = 'Erika', last_name = 'Muster', street = 'Weg 1',
           zip_code = '89073', city = 'Ulm', country = 'DE', phone = '0731' WHERE id = $1",
        desk.seller,
    )
    .await;
    desk
}

async fn end_event(db: &PgPool, event: Uuid, days_ago: i32) {
    sqlx::query(
        "UPDATE events SET start_date = now() - make_interval(days => $2, hours => 5),
           end_date = now() - make_interval(days => $2) WHERE id = $1",
    )
    .bind(event)
    .bind(days_ago)
    .execute(db)
    .await
    .unwrap();
}

async fn vendors(desk: &Desk) -> Value {
    let reply = desk
        .app
        .query(
            "eventRoles.getVendorsForEvent",
            json!({ "eventId": desk.event }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    reply.body["value"].clone()
}

async fn my_sales(desk: &Desk) -> Value {
    let seller = fixtures::session(&desk.db, desk.seller).await;
    desk.app
        .query("purchases.getMySales", json!({}), Some(&seller))
        .await
        .body["value"]
        .clone()
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_sale_keeps_its_item_when_the_product_changes_or_goes(db: PgPool) {
    let desk = desk(&db, json!({})).await;
    let (product, relation) = desk.item("Ski", 50.0).await;
    exec(
        &db,
        r#"UPDATE products SET attributes = '{"brand": "Atomic"}' WHERE id = $1"#,
        product,
    )
    .await;
    let reply = desk.sell(json!({ "eventProductId": relation })).await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    let kept: (Option<String>, Option<String>, Option<Value>, Option<i32>) = sqlx::query_as(
        "SELECT product_title, category_label, product_attributes, seller_number FROM purchases",
    )
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!(
        kept,
        (
            Some("Ski".into()),
            Some("Allgemein".into()),
            Some(json!({ "brand": "Atomic" })),
            Some(7)
        )
    );

    // Renamed later: the seller sees what was sold
    exec(
        &db,
        "UPDATE products SET title = 'Anders' WHERE id = $1",
        product,
    )
    .await;
    assert_eq!(my_sales(&desk).await[0]["items"][0]["title"], "Ski");

    // Deleted: the sale stays, without the product
    exec(&db, "DELETE FROM products WHERE id = $1", product).await;
    let item = my_sales(&desk).await[0]["items"][0].clone();
    assert_eq!(item["title"], "Ski");
    assert_eq!(item["productId"], Value::Null);
    assert!(item["purchaseId"].is_string());
    let vendors = vendors(&desk).await;
    assert_eq!(vendors[0]["totalRevenue"], 50.0);
    assert_eq!(vendors[0]["sellerNumber"], 7);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_settlement_shows_the_seller_as_recorded_once_the_bazaar_is_over(db: PgPool) {
    let desk = desk(&db, json!({})).await;
    let (_, relation) = desk.item("Ski", 50.0).await;
    desk.sell(json!({ "eventProductId": relation })).await;
    exec(
        &db,
        "UPDATE users SET first_name = 'Neu', city = 'Berlin' WHERE id = $1",
        desk.seller,
    )
    .await;

    // During the bazaar the profile as it is now
    let running = vendors(&desk).await;
    assert_eq!(
        (running[0]["firstName"].clone(), running[0]["city"].clone()),
        (json!("Neu"), json!("Berlin"))
    );

    // Afterwards as taken at the sale
    end_event(&db, desk.event, 1).await;
    let over = vendors(&desk).await;
    assert_eq!(
        (over[0]["firstName"].clone(), over[0]["city"].clone()),
        (json!("Erika"), json!("Ulm"))
    );
    assert_eq!(over[0]["lastName"], "Muster");

    // The payout takes the details again
    let paid = desk
        .app
        .mutation(
            "eventSeller.markVendorPayoutReceived",
            json!({ "eventId": desk.event, "vendorUserId": desk.seller }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(paid.status, StatusCode::OK, "{}", paid.body);
    assert_eq!(vendors(&desk).await[0]["firstName"], "Neu");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_seller_without_role_stays_in_the_settlement(db: PgPool) {
    let desk = desk(&db, json!({})).await;
    let (_, relation) = desk.item("Ski", 50.0).await;
    desk.sell(json!({ "eventProductId": relation })).await;
    // Like an account deleted before #166: role gone, profile emptied later (#168)
    exec(
        &db,
        "DELETE FROM event_roles WHERE user_id = $1 AND role = 'seller'",
        desk.seller,
    )
    .await;
    exec(
        &db,
        "UPDATE users SET status = 'deleted', first_name = NULL, last_name = NULL WHERE id = $1",
        desk.seller,
    )
    .await;
    let vendors = vendors(&desk).await;
    assert_eq!(vendors.as_array().unwrap().len(), 1);
    assert_eq!(vendors[0]["firstName"], "Erika");
    assert_eq!(vendors[0]["totalRevenue"], 50.0);

    // And can still be paid out
    let paid = desk
        .app
        .mutation(
            "eventSeller.markVendorPayoutReceived",
            json!({ "eventId": desk.event, "vendorUserId": desk.seller }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(paid.status, StatusCode::OK, "{}", paid.body);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_proof_of_offers_lists_sold_items_whose_product_is_gone(db: PgPool) {
    let desk = desk(&db, json!({ "fixedSellerData": true })).await;
    let (product, relation) = desk.item("Rad", 120.0).await;
    desk.sell(json!({ "eventProductId": relation })).await;
    exec(&db, "DELETE FROM products WHERE id = $1", product).await;
    let reply = desk
        .app
        .query(
            "sellerRecords.getProofOfOffers",
            json!({ "eventId": desk.event }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    let items = reply.body["value"]["items"].clone();
    assert_eq!(items.as_array().unwrap().len(), 1);
    let item = &items[0];
    assert_eq!(item["productId"], Value::Null);
    assert_eq!(
        (
            item["title"].clone(),
            item["category"].clone(),
            item["status"].clone()
        ),
        (json!("Rad"), json!("Allgemein"), json!("sold"))
    );
    assert_eq!(
        (item["price"].clone(), item["soldFor"].clone()),
        (json!(120.0), json!(120.0))
    );
    assert_eq!(item["seller"]["lastName"], "Muster");
    assert_eq!(item["seller"]["sellerNumber"], 7);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn sales_and_returns_are_final_after_the_settlement_period(db: PgPool) {
    let desk = desk(&db, json!({})).await;
    sqlx::query(
        "INSERT INTO feature_flags (key, value) VALUES ('allow_undo_inventory_actions', true)",
    )
    .execute(&db)
    .await
    .unwrap();
    let (_, sold) = desk.item("Ski", 50.0).await;
    let (_, returned) = desk.item("Helm", 10.0).await;
    desk.sell(json!({ "eventProductId": sold })).await;
    exec(
        &db,
        "UPDATE event_products SET status = 'returned' WHERE id = $1",
        returned,
    )
    .await;

    let undo_sale = || {
        desk.app.mutation(
            "purchases.undoSale",
            json!({ "eventProductId": sold }),
            Some(&desk.team),
        )
    };
    let undo_return = || {
        desk.app.mutation(
            "eventProducts.undoReturn",
            json!({ "eventProductId": returned }),
            Some(&desk.team),
        )
    };
    let set_status = || {
        desk.app.mutation(
            "eventProducts.updateProductStatus",
            json!({ "eventProductId": returned, "status": "available" }),
            Some(&desk.team),
        )
    };
    end_event(&db, desk.event, 91).await;
    assert_eq!(undo_sale().await.body["code"], "event.settlementClosed");
    assert_eq!(undo_return().await.body["code"], "event.settlementClosed");
    assert_eq!(set_status().await.body["code"], "event.settlementClosed");

    // Within the period they still work
    end_event(&db, desk.event, 89).await;
    assert_eq!(undo_sale().await.body["value"], json!({ "success": true }));
    assert_eq!(
        undo_return().await.body["value"],
        json!({ "success": true })
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn intake_records_the_seller(db: PgPool) {
    let desk = desk(&db, json!({})).await;
    let product = fixtures::product(&db, desk.seller, "Ski", 50.0).await;
    let relation = fixtures::event_product(&db, desk.event, product, "announced").await;
    let reply = desk
        .app
        .mutation(
            "eventProducts.updateProductStatus",
            json!({ "eventProductId": relation, "status": "available" }),
            Some(&desk.team),
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    let snapshot: Option<Value> =
        sqlx::query_scalar("SELECT seller_snapshot FROM event_sellers WHERE user_id = $1")
            .bind(desk.seller)
            .fetch_one(&db)
            .await
            .unwrap();
    let snapshot = snapshot.unwrap();
    assert_eq!(
        (
            snapshot["name"].clone(),
            snapshot["city"].clone(),
            snapshot["email"].clone()
        ),
        (json!("Seller"), json!("Ulm"), json!("seller@test.example"))
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_backfill_fills_sales_and_seller_rows_without_snapshot(db: PgPool) {
    let organizer = fixtures::user(&db, "Orga").await;
    let seller = fixtures::user(&db, "Seller").await;
    let event = fixtures::event(&db, fixtures::EventSpec::new("Basar", organizer)).await;
    let product = fixtures::product(&db, seller, "Ski", 50.0).await;
    // Sold before the migration, and the seller has no seller row
    fixtures::purchase(&db, event, product, seller, (50.0, 5.0, 45.0)).await;

    let mut conn = db.acquire().await.unwrap();
    backfill_snapshots(&mut conn).await.unwrap();
    backfill_snapshots(&mut conn).await.unwrap();
    let sale: (Option<String>, Option<String>) =
        sqlx::query_as("SELECT product_title, category_label FROM purchases")
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(sale, (Some("Ski".into()), Some("Allgemein".into())));
    let row: (bool, Option<Value>) = sqlx::query_as(
        "SELECT payout_received, seller_snapshot FROM event_sellers WHERE user_id = $1",
    )
    .bind(seller)
    .fetch_one(&db)
    .await
    .unwrap();
    assert!(!row.0);
    assert_eq!(row.1.unwrap()["name"], "Seller");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_export_has_sales_payouts_offers_questions_and_roles(db: PgPool) {
    let desk = desk(&db, json!({})).await;
    let (_, relation) = desk.item("Ski", 50.0).await;
    desk.sell(json!({ "eventProductId": relation })).await;
    // The seller also asked about and bid for another item
    let other = fixtures::user(&db, "Other").await;
    let (helmet, helmet_relation) = desk.item_of(other, "Helm", 20.0).await;
    sqlx::query(
        "INSERT INTO product_offers (event_id, product_id, event_product_id, buyer_id, amount, message, status)
         VALUES ($1, $2, $3, $4, 15, 'Geht 15?', 'pending')",
    )
    .bind(desk.event)
    .bind(helmet)
    .bind(helmet_relation)
    .bind(desk.seller)
    .execute(&db)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO product_questions (event_id, product_id, asker_id, question) VALUES ($1, $2, $3, 'Größe?')",
    )
    .bind(desk.event)
    .bind(helmet)
    .bind(desk.seller)
    .execute(&db)
    .await
    .unwrap();

    let seller = fixtures::session(&db, desk.seller).await;
    let export = desk
        .app
        .query("users.getExportData", json!({}), Some(&seller))
        .await
        .body["value"]
        .clone();
    assert_eq!(export["profile"]["phone"], "0731");
    assert_eq!(
        (
            export["sales"][0]["title"].clone(),
            export["sales"][0]["payoutAmount"].clone()
        ),
        (json!("Ski"), json!(45.0))
    );
    assert_eq!(export["sellerParticipations"][0]["sellerNumber"], 7);
    assert_eq!(
        export["sellerParticipations"][0]["recordedDetails"]["city"],
        "Ulm"
    );
    assert_eq!(
        (
            export["offers"][0]["product"].clone(),
            export["offers"][0]["message"].clone()
        ),
        (json!("Helm"), json!("Geht 15?"))
    );
    assert_eq!(export["questions"][0]["question"], "Größe?");
    assert_eq!(
        (
            export["eventRoles"][0]["event"].clone(),
            export["eventRoles"][0]["role"].clone()
        ),
        (json!("Basar"), json!("seller"))
    );
}
