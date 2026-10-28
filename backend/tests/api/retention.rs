//! The deadlines of bazaars, items and old data (#169): the daily cron retention.run.

use crate::common;

use axum::http::StatusCode;
use bazarpro_backend::jobs;
use common::desk::Desk;
use common::fixtures;
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

async fn count(db: &PgPool, sql: &str, id: Uuid) -> i64 {
    sqlx::query_scalar(sqlx::AssertSqlSafe(sql))
        .bind(id)
        .fetch_one(db)
        .await
        .unwrap()
}

async fn exec(db: &PgPool, sql: &str, id: Uuid) {
    sqlx::query(sqlx::AssertSqlSafe(sql))
        .bind(id)
        .execute(db)
        .await
        .unwrap();
}

async fn file(db: &PgPool) -> Uuid {
    sqlx::query_scalar(
        "INSERT INTO files (storage_key, content_type) VALUES (gen_random_uuid()::text, 'image/png')
         RETURNING id",
    )
    .fetch_one(db)
    .await
    .unwrap()
}

/// Runs the cron job and what it schedules (file deletions, its next batch).
async fn run(desk: &Desk, batch_size: Option<i64>) {
    let mut conn = desk.db.acquire().await.unwrap();
    jobs::enqueue(
        &mut conn,
        "retention.run",
        &json!({ "batchSize": batch_size }),
        chrono::Utc::now(),
    )
    .await
    .unwrap();
    desk.app.run_jobs().await;
}

async fn end_event(db: &PgPool, event: Uuid, ended: &str) {
    sqlx::query(sqlx::AssertSqlSafe(format!(
        "UPDATE events SET start_date = now() - interval '{ended}' - interval '5 hours',
           end_date = now() - interval '{ended}' WHERE id = $1"
    )))
    .bind(event)
    .execute(db)
    .await
    .unwrap();
}

/// A bazaar with cover and map, a message, a storage location, and two items of the
/// seller (number 7): "Ski" sold with an image and a question, "Helm" returned.
struct Bazaar {
    desk: Desk,
    sold: Uuid,
    returned: Uuid,
    image: Uuid,
    cover: Uuid,
}

async fn bazaar(db: &PgPool) -> Bazaar {
    let desk = Desk::new(db.clone(), json!({})).await;
    fixtures::event_seller(db, desk.event, desk.seller, 7, false).await;
    let (sold, relation) = desk.item("Ski", 50.0).await;
    let (returned, _) = desk.item("Helm", 10.0).await;
    let image = file(db).await;
    sqlx::query("INSERT INTO product_images (product_id, position, file_id) VALUES ($1, 0, $2)")
        .bind(sold)
        .bind(image)
        .execute(db)
        .await
        .unwrap();
    let buyer = fixtures::user(db, "Buyer").await;
    sqlx::query(
        "INSERT INTO product_questions (event_id, product_id, asker_id, question)
         VALUES ($1, $2, $3, 'Größe?')",
    )
    .bind(desk.event)
    .bind(sold)
    .bind(buyer)
    .execute(db)
    .await
    .unwrap();
    let reply = desk.sell(json!({ "eventProductId": relation })).await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    exec(
        db,
        "UPDATE event_products SET status = 'returned', internal_note = 'Haken 3'
         WHERE product_id = $1",
        returned,
    )
    .await;
    let cover = file(db).await;
    sqlx::query("UPDATE events SET cover_image_id = $2, logistics_note = 'Hof' WHERE id = $1")
        .bind(desk.event)
        .bind(cover)
        .execute(db)
        .await
        .unwrap();
    exec(
        db,
        "INSERT INTO event_location_categories (event_id, label) VALUES ($1, 'Halle')",
        desk.event,
    )
    .await;
    sqlx::query(
        "INSERT INTO event_broadcasts (event_id, sender_id, subject, body, audience, important)
         SELECT id, organizer_id, 'Info', 'Text', 'all', false FROM events WHERE id = $1",
    )
    .bind(desk.event)
    .execute(db)
    .await
    .unwrap();
    Bazaar {
        desk,
        sold,
        returned,
        image,
        cover,
    }
}

async fn query(desk: &Desk, name: &str, args: Value, session: Option<&str>) -> Value {
    let reply = desk.app.query(name, args, session).await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    reply.body["value"].clone()
}

async fn vendors(desk: &Desk) -> Value {
    query(
        desk,
        "eventRoles.getVendorsForEvent",
        json!({ "eventId": desk.event }),
        Some(&desk.team),
    )
    .await
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn after_the_bazaar_its_items_are_no_longer_public(db: PgPool) {
    let Bazaar {
        desk,
        sold,
        returned,
        ..
    } = bazaar(&db).await;
    let seller = fixtures::session(&db, desk.seller).await;
    let items = json!({ "eventId": desk.event });
    assert_eq!(
        query(
            &desk,
            "eventProducts.getProductsForEvent",
            items.clone(),
            None
        )
        .await
        .as_array()
        .unwrap()
        .len(),
        2
    );

    end_event(&db, desk.event, "1 day").await;
    run(&desk, None).await;
    let public = query(
        &desk,
        "eventProducts.getProductsForEvent",
        items.clone(),
        None,
    )
    .await;
    assert_eq!(public, json!([]));
    let product = json!({ "productId": sold });
    assert_eq!(
        query(&desk, "products.getProduct", product.clone(), None).await,
        Value::Null
    );
    // The seller still sees their items with images, the team too
    let own = query(
        &desk,
        "eventProducts.getProductsForEvent",
        items,
        Some(&seller),
    )
    .await;
    assert_eq!(own.as_array().unwrap().len(), 2);
    let page = query(&desk, "products.getProduct", product.clone(), Some(&seller)).await;
    assert_eq!(page["images"].as_array().unwrap().len(), 1);
    assert!(
        query(&desk, "products.getProduct", product, Some(&desk.team))
            .await
            .is_object()
    );
    // The event page itself stays public
    assert!(
        query(
            &desk,
            "events.getPublicEventForViewer",
            json!({ "id": desk.event }),
            None
        )
        .await
        .is_object()
    );
    // Nothing deleted yet
    assert_eq!(
        count(&db, "SELECT count(*) FROM products WHERE id = $1", sold).await
            + count(&db, "SELECT count(*) FROM products WHERE id = $1", returned).await,
        2
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn after_the_settlement_sold_items_go_and_the_settlement_stays(db: PgPool) {
    let Bazaar {
        desk,
        sold,
        returned,
        image,
        cover,
    } = bazaar(&db).await;
    let before = vendors(&desk).await;
    end_event(&db, desk.event, "4 months").await;
    run(&desk, None).await;

    // The sold item with its image, relation and question is gone, the sale is not
    for sql in [
        "SELECT count(*) FROM products WHERE id = $1",
        "SELECT count(*) FROM event_products WHERE product_id = $1",
        "SELECT count(*) FROM product_questions WHERE product_id = $1",
        "SELECT count(*) FROM product_images WHERE product_id = $1",
    ] {
        assert_eq!(count(&db, sql, sold).await, 0, "{sql}");
    }
    assert_eq!(
        count(&db, "SELECT count(*) FROM files WHERE id = $1", image).await,
        0
    );
    let sale: (Option<Uuid>, Option<String>, Option<i32>) = sqlx::query_as(
        "SELECT product_id, product_title, seller_number FROM purchases WHERE event_id = $1",
    )
    .bind(desk.event)
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!(sale, (None, Some("Ski".into()), Some(7)));
    // The returned item stays the seller's
    assert_eq!(
        count(&db, "SELECT count(*) FROM products WHERE id = $1", returned).await,
        1
    );
    // The settlement is complete
    let after = vendors(&desk).await;
    assert_eq!(after[0]["totalRevenue"], before[0]["totalRevenue"]);
    assert_eq!(after[0]["totalRevenue"], 50.0);
    assert_eq!(after[0]["sellerNumber"], 7);
    let seller = fixtures::session(&db, desk.seller).await;
    let sales = query(&desk, "purchases.getMySales", json!({}), Some(&seller)).await;
    assert_eq!(sales[0]["items"][0]["title"], "Ski");
    // The page of the bazaar is still public and complete
    let event = query(
        &desk,
        "events.getPublicEventForViewer",
        json!({ "id": desk.event }),
        None,
    )
    .await;
    assert!(event["coverImageUrl"].is_string());
    assert_eq!(
        count(&db, "SELECT count(*) FROM files WHERE id = $1", cover).await,
        1
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn after_a_year_the_bazaar_is_only_for_its_team_and_loses_its_content(db: PgPool) {
    let Bazaar { desk, cover, .. } = bazaar(&db).await;
    end_event(&db, desk.event, "13 months").await;
    run(&desk, None).await;

    let id = json!({ "id": desk.event });
    let stranger = fixtures::session(&db, fixtures::user(&db, "Fremd").await).await;
    for (name, session) in [
        ("events.getPublicEventForViewer", None),
        ("events.getEvent", None),
        ("events.getEvent", Some(stranger.as_str())),
    ] {
        assert_eq!(
            query(&desk, name, id.clone(), session).await,
            Value::Null,
            "{name}"
        );
    }
    let listed = query(&desk, "events.get", json!({ "includePast": true }), None).await;
    assert_eq!(listed, json!([]));

    // The team sees the bazaar and its settlement, without images and texts
    let event = query(&desk, "events.getEvent", id, Some(&desk.team)).await;
    assert_eq!(event["title"], "Basar");
    assert_eq!(event["description"], "");
    assert_eq!(event["coverImageUrl"], Value::Null);
    assert_eq!(vendors(&desk).await[0]["totalRevenue"], 50.0);
    assert_eq!(
        count(&db, "SELECT count(*) FROM files WHERE id = $1", cover).await,
        0
    );
    for sql in [
        "SELECT count(*) FROM event_broadcasts WHERE event_id = $1",
        "SELECT count(*) FROM event_location_categories WHERE event_id = $1",
        "SELECT count(*) FROM event_products WHERE event_id = $1 AND internal_note IS NOT NULL",
        "SELECT count(*) FROM events WHERE id = $1 AND logistics_note IS NOT NULL",
    ] {
        assert_eq!(count(&db, sql, desk.event).await, 0, "{sql}");
    }
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_settlement_export_stays_complete_until_the_bazaar_is_deleted(db: PgPool) {
    let Bazaar { desk, .. } = bazaar(&db).await;
    let args = json!({ "eventId": desk.event });
    let stranger = fixtures::session(&db, fixtures::user(&db, "Fremd").await).await;
    let reply = desk
        .app
        .query("settlement.getExport", args.clone(), Some(&stranger))
        .await;
    assert_ne!(reply.status, StatusCode::OK);

    end_event(&db, desk.event, "1 day").await;
    let export = query(
        &desk,
        "settlement.getExport",
        args.clone(),
        Some(&desk.team),
    )
    .await;
    assert_eq!(export["event"]["title"], "Basar");
    assert_eq!(export["event"]["commission"], 10.0);
    let sale = &export["sales"][0];
    assert_eq!(
        (&sale["title"], &sale["sellerNumber"], &sale["totalAmount"]),
        (&json!("Ski"), &json!(7), &json!(50.0))
    );
    assert_eq!(
        (&sale["commission"], &sale["payout"]),
        (&json!(5.0), &json!(45.0))
    );
    let seller = &export["sellers"][0];
    assert_eq!(
        (&seller["firstName"], &seller["revenue"], &seller["paid"]),
        (&json!("Seller"), &json!(50.0), &json!(false))
    );

    // Without the sold items, and without the content of the bazaar (dates moved here)
    for ended in ["4 months", "13 months"] {
        end_event(&db, desk.event, ended).await;
        run(&desk, None).await;
        let later = query(
            &desk,
            "settlement.getExport",
            args.clone(),
            Some(&desk.team),
        )
        .await;
        assert_eq!(
            (&later["sales"], &later["sellers"], &later["event"]["title"]),
            (
                &export["sales"],
                &export["sellers"],
                &export["event"]["title"]
            ),
            "{ended}"
        );
    }
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn eight_years_after_its_year_the_bazaar_is_deleted(db: PgPool) {
    let Bazaar { desk, returned, .. } = bazaar(&db).await;
    let walk_in: Uuid = sqlx::query_scalar(
        "INSERT INTO users (name, first_name, contact_email, status, managed_by_event_id)
         VALUES ('Walk', 'Walk', 'walk@example.org', 'active', $1) RETURNING id",
    )
    .bind(desk.event)
    .fetch_one(&db)
    .await
    .unwrap();
    // Ended on 31 December, nine years ago: the period ended on 1 January this year
    sqlx::query(
        "UPDATE events SET
           end_date = make_timestamptz(extract(year FROM now())::int - 9, 12, 31, 12, 0, 0, 'Europe/Berlin'),
           start_date = make_timestamptz(extract(year FROM now())::int - 9, 12, 31, 8, 0, 0, 'Europe/Berlin')
         WHERE id = $1",
    )
    .bind(desk.event)
    .execute(&db)
    .await
    .unwrap();
    let young = fixtures::event(
        &db,
        fixtures::EventSpec::new("Jünger", fixtures::user(&db, "Orga2").await),
    )
    .await;
    // Ended in January eight years ago: kept until the end of this year
    exec(
        &db,
        "UPDATE events SET
           end_date = make_timestamptz(extract(year FROM now())::int - 8, 1, 2, 12, 0, 0, 'Europe/Berlin'),
           start_date = make_timestamptz(extract(year FROM now())::int - 8, 1, 2, 8, 0, 0, 'Europe/Berlin')
         WHERE id = $1",
        young,
    )
    .await;
    run(&desk, None).await;

    for sql in [
        "SELECT count(*) FROM events WHERE id = $1",
        "SELECT count(*) FROM purchases WHERE event_id = $1",
        "SELECT count(*) FROM event_sellers WHERE event_id = $1",
        "SELECT count(*) FROM event_roles WHERE event_id = $1",
    ] {
        assert_eq!(count(&db, sql, desk.event).await, 0, "{sql}");
    }
    assert_eq!(
        count(&db, "SELECT count(*) FROM events WHERE id = $1", young).await,
        1
    );
    // The seller keeps the item they got back; the walk-in seller is anonymized
    assert_eq!(
        count(&db, "SELECT count(*) FROM products WHERE id = $1", returned).await,
        1
    );
    assert_eq!(
        count(
            &db,
            "SELECT count(*) FROM users WHERE id = $1 AND anonymized_at IS NOT NULL AND name IS NULL",
            walk_in
        )
        .await,
        1
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn seller_records_shrink_to_the_name_after_three_years(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({ "fixedSellerData": true })).await;
    let plain = Desk::new(db.clone(), json!({})).await;
    let snapshot = json!({
        "firstName": "Erika", "lastName": "Muster", "street": "Weg 1", "zipCode": "89073",
        "city": "Ulm", "country": "DE", "phone": "0731", "email": "erika@example.org"
    });
    for desk in [&desk, &plain] {
        let row = fixtures::event_seller(&db, desk.event, desk.seller, 1, true).await;
        sqlx::query("UPDATE event_sellers SET seller_snapshot = $2 WHERE id = $1")
            .bind(row)
            .bind(&snapshot)
            .execute(&db)
            .await
            .unwrap();
        exec(
            &db,
            "UPDATE events SET
               end_date = make_timestamptz(extract(year FROM now())::int - 4, 6, 1, 12, 0, 0, 'Europe/Berlin'),
               start_date = make_timestamptz(extract(year FROM now())::int - 4, 6, 1, 8, 0, 0, 'Europe/Berlin')
             WHERE id = $1",
            desk.event,
        )
        .await;
    }
    run(&desk, None).await;

    let kept = |event: Uuid| {
        let db = db.clone();
        async move {
            sqlx::query_scalar::<_, Value>(
                "SELECT seller_snapshot FROM event_sellers WHERE event_id = $1",
            )
            .bind(event)
            .fetch_one(&db)
            .await
            .unwrap()
        }
    };
    assert_eq!(
        kept(desk.event).await,
        json!({ "firstName": "Erika", "lastName": "Muster" })
    );
    // Without fixedSellerData the settlement keeps the details for the full period
    assert_eq!(kept(plain.event).await, snapshot);
}

async fn offer_record(db: &PgPool, desk: &Desk) {
    sqlx::query(
        "INSERT INTO offer_records (event_id, seller_id, title, price) VALUES ($1, $2, 'Rad', 90)",
    )
    .bind(desk.event)
    .bind(desk.seller)
    .execute(db)
    .await
    .unwrap();
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn who_offered_what_is_kept_only_by_bazaars_with_a_record(db: PgPool) {
    let record = Desk::new(db.clone(), json!({ "fixedSellerData": true })).await;
    let plain = Desk::new(db.clone(), json!({})).await;
    for desk in [&record, &plain] {
        offer_record(&db, desk).await;
        end_event(&db, desk.event, "4 months").await;
    }
    run(&record, None).await;
    let left = |event: Uuid| {
        count(
            &db,
            "SELECT count(*) FROM offer_records WHERE event_id = $1",
            event,
        )
    };
    assert_eq!((left(record.event).await, left(plain.event).await), (1, 0));

    // Three years after the end of its year the record goes too
    exec(
        &db,
        "UPDATE events SET
           end_date = make_timestamptz(extract(year FROM now())::int - 4, 6, 1, 12, 0, 0, 'Europe/Berlin'),
           start_date = make_timestamptz(extract(year FROM now())::int - 4, 6, 1, 8, 0, 0, 'Europe/Berlin')
         WHERE id = $1",
        record.event,
    )
    .await;
    run(&record, None).await;
    assert_eq!(left(record.event).await, 0);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn offline_actions_of_the_team_go_after_the_settlement(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let later = Desk::new(db.clone(), json!({})).await;
    for event in [desk.event, later.event] {
        exec(
            &db,
            "INSERT INTO offline_actions (id, event_id, name, args, label, done_at, error)
             VALUES (gen_random_uuid(), $1, 'eventProducts.setEventProductNote',
                     '{\"note\": \"Haken 3\"}', 'Ski', now(), 'seller.paidOutUndoFirst')",
            event,
        )
        .await;
    }
    end_event(&db, desk.event, "4 months").await;
    end_event(&db, later.event, "2 months").await;
    run(&desk, None).await;

    let sql = "SELECT count(*) FROM offline_actions WHERE event_id = $1";
    assert_eq!(count(&db, sql, desk.event).await, 0);
    assert_eq!(count(&db, sql, later.event).await, 1);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn old_data_without_a_bazaar_is_cleaned_up(db: PgPool) {
    let desk = Desk::new(db.clone(), json!({})).await;
    let walk_in: Uuid = sqlx::query_scalar(
        "INSERT INTO users (name, contact_email, phone, status, managed_by_event_id)
         VALUES ('Walk', 'walk@example.org', '0731', 'active', $1) RETURNING id",
    )
    .bind(desk.event)
    .fetch_one(&db)
    .await
    .unwrap();
    end_event(&db, desk.event, "4 months").await;
    sqlx::query(
        "INSERT INTO contact_messages (name, email, message, accepted_privacy_policy, created_at, handled_at)
         VALUES ('Alt', 'a@example.org', 'x', true, now() - interval '8 months', now() - interval '7 months'),
                ('Offen', 'b@example.org', 'x', true, now() - interval '8 months', NULL),
                ('Uralt', 'c@example.org', 'x', true, now() - interval '13 months', NULL)",
    )
    .execute(&db)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO reports (target_type, target_id, reason, details, reporter_email, status, resolved_at)
         VALUES ('event', gen_random_uuid(), 'spam', 'Details', 'r@example.org', 'resolved', now() - interval '7 months'),
                ('event', gen_random_uuid(), 'spam', 'Neu', 'n@example.org', 'resolved', now() - interval '1 month')",
    )
    .execute(&db)
    .await
    .unwrap();
    exec(
        &db,
        "INSERT INTO sessions (user_id, token_hash, expires_at)
         VALUES ($1, '\\x01', now() - interval '1 minute'), ($1, '\\x02', now() + interval '1 day')",
        desk.seller,
    )
    .await;
    run(&desk, None).await;

    let names: Vec<String> = sqlx::query_scalar("SELECT name FROM contact_messages ORDER BY name")
        .fetch_all(&db)
        .await
        .unwrap();
    assert_eq!(names, ["Offen"]);
    let reports: Vec<(String, Option<String>)> =
        sqlx::query_as("SELECT details, reporter_email FROM reports ORDER BY resolved_at")
            .fetch_all(&db)
            .await
            .unwrap();
    assert_eq!(
        reports,
        [
            (String::new(), None),
            ("Neu".to_owned(), Some("n@example.org".to_owned()))
        ]
    );
    assert_eq!(
        count(
            &db,
            "SELECT count(*) FROM sessions WHERE user_id = $1",
            desk.seller
        )
        .await,
        1
    );
    assert_eq!(
        count(
            &db,
            "SELECT count(*) FROM users WHERE id = $1 AND contact_email IS NULL AND phone IS NULL
               AND name = 'Walk'",
            walk_in
        )
        .await,
        1
    );
}

/// Everything the cron may change, to compare two runs.
async fn state(db: &PgPool) -> Value {
    sqlx::query_scalar(
        "SELECT jsonb_build_object(
           'events', (SELECT jsonb_agg(to_jsonb(e) - 'products_purged_at' - 'content_purged_at'
                                       ORDER BY id) FROM events e),
           'products', (SELECT jsonb_agg(id ORDER BY id) FROM products),
           'purchases', (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM purchases p),
           'sellers', (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM event_sellers s),
           'files', (SELECT jsonb_agg(id ORDER BY id) FROM files))",
    )
    .fetch_one(db)
    .await
    .unwrap()
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_second_run_changes_nothing(db: PgPool) {
    let Bazaar { desk, .. } = bazaar(&db).await;
    end_event(&db, desk.event, "13 months").await;
    run(&desk, None).await;
    let first = state(&db).await;
    let marks: (bool, bool) = sqlx::query_as(
        "SELECT products_purged_at IS NOT NULL, content_purged_at IS NOT NULL FROM events WHERE id = $1",
    )
    .bind(desk.event)
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!(marks, (true, true));
    run(&desk, None).await;
    assert_eq!(state(&db).await, first);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn more_than_one_batch_is_finished_by_scheduling_again(db: PgPool) {
    let Bazaar { desk, .. } = bazaar(&db).await;
    let organizer = fixtures::user(&db, "Orga2").await;
    let mut events = vec![desk.event];
    for title in ["A", "B", "C", "D"] {
        events.push(fixtures::event(&db, fixtures::EventSpec::new(title, organizer)).await);
    }
    for event in &events {
        end_event(&db, *event, "13 months").await;
    }
    run(&desk, Some(2)).await;

    let open: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM events WHERE products_purged_at IS NULL OR content_purged_at IS NULL",
    )
    .fetch_one(&db)
    .await
    .unwrap();
    assert_eq!(open, 0);
    let waiting: i64 = sqlx::query_scalar("SELECT count(*) FROM jobs")
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(waiting, 0);
}
