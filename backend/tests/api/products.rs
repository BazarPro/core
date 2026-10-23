//! Items and items in events.

use crate::common;

use axum::http::StatusCode;
use common::TestApp;
use common::fixtures::{self, EventSpec};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

const PNG: &[u8] = b"\x89PNG\r\n\x1a\n-item";

struct Seller {
    id: Uuid,
    session: String,
}

async fn seller(db: &PgPool, name: &str) -> Seller {
    let id = fixtures::user(db, name).await;
    Seller {
        id,
        session: fixtures::session(db, id).await,
    }
}

async fn photo(app: &TestApp, seller: &Seller) -> Value {
    app.upload(PNG.to_vec(), "image/png", Some(&seller.session))
        .await
        .body["storageId"]
        .clone()
}

fn product_args(seller: &Seller, category: Uuid, images: Vec<Value>) -> Value {
    json!({
        "title": "Kinderfahrrad",
        "vendorId": seller.id,
        "description": "Gut erhalten",
        "condition": "good",
        "images": images,
        "productCategory": category,
        "price": 40,
        "readyForSale": true,
        "sold": false,
    })
}

async fn add(app: &TestApp, seller: &Seller, args: Value) -> Uuid {
    let reply = app
        .mutation("products.addProduct", args, Some(&seller.session))
        .await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    reply.body["value"].as_str().unwrap().parse().unwrap()
}

async fn announce(app: &TestApp, seller: &Seller, event: Uuid, product: Uuid) -> common::Reply {
    app.mutation(
        "eventProducts.addProductToEvent",
        json!({ "eventId": event, "productId": product }),
        Some(&seller.session),
    )
    .await
}

async fn status_of(db: &PgPool, event: Uuid, product: Uuid) -> Option<String> {
    sqlx::query_scalar(
        "SELECT status::text FROM event_products WHERE event_id = $1 AND product_id = $2",
    )
    .bind(event)
    .bind(product)
    .fetch_optional(db)
    .await
    .unwrap()
}

async fn set_status(db: &PgPool, event: Uuid, product: Uuid, status: &str) {
    sqlx::query("UPDATE event_products SET status = $3::event_product_status WHERE event_id = $1 AND product_id = $2")
        .bind(event)
        .bind(product)
        .bind(status)
        .execute(db)
        .await
        .unwrap();
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn adding_updating_and_deleting_items(db: PgPool) {
    let app = TestApp::new(db.clone());
    let erika = seller(&db, "Erika").await;
    let other = seller(&db, "Other").await;
    let category = fixtures::category(&db, "Fahrräder").await;
    let image = photo(&app, &erika).await;

    let foreign = app
        .mutation(
            "products.addProduct",
            product_args(&erika, category, vec![]),
            Some(&other.session),
        )
        .await;
    assert_eq!(foreign.body["code"], "auth.forbidden");
    assert_eq!(
        app.mutation(
            "products.addProduct",
            product_args(&erika, category, vec![]),
            None
        )
        .await
        .body["code"],
        "auth.required"
    );
    let mut args = product_args(&erika, category, vec![image.clone()]);
    args["attributes"] = json!({ "frameNumber": " WBK123 ", "unknown": "weg" });
    args["minimumPrice"] = json!(30);
    let id = add(&app, &erika, args).await;

    let product = app
        .query(
            "products.getProduct",
            json!({ "productId": id }),
            Some(&erika.session),
        )
        .await
        .body["value"]
        .clone();
    assert_eq!(product["title"], "Kinderfahrrad");
    assert_eq!(product["images"], json!([image]));
    assert_eq!(product["attributes"], json!({ "frameNumber": "WBK123" }));
    assert_eq!(
        product["attributeList"],
        json!([{ "label": "Rahmennummer", "text": "frameNumber", "value": "WBK123" }])
    );
    assert_eq!(product["minimumPrice"], 30.0);
    assert_eq!(product["categoryName"], "Fahrräder");
    assert_eq!(
        (
            product["isLocked"].clone(),
            product["activeListing"].clone()
        ),
        (json!(false), Value::Null)
    );
    // The minimum price stays private
    let public = app
        .query("products.getProduct", json!({ "productId": id }), None)
        .await
        .body["value"]
        .clone();
    assert!(public.get("minimumPrice").is_none());

    let mut too_high = product_args(&erika, category, vec![]);
    too_high["minimumPrice"] = json!(40);
    assert_eq!(
        app.mutation("products.addProduct", too_high, Some(&erika.session))
            .await
            .body["code"],
        "product.minimumAbovePrice"
    );

    let mut update = product_args(&erika, category, vec![image.clone()]);
    update["productId"] = json!(id);
    update.as_object_mut().unwrap().remove("vendorId");
    update.as_object_mut().unwrap().remove("sold");
    update["title"] = json!("Laufrad");
    assert_eq!(
        app.mutation(
            "products.updateProduct",
            update.clone(),
            Some(&other.session)
        )
        .await
        .body["code"],
        "auth.forbidden"
    );
    app.mutation(
        "products.updateProduct",
        update.clone(),
        Some(&erika.session),
    )
    .await;
    let product = app
        .query(
            "products.getProduct",
            json!({ "productId": id }),
            Some(&erika.session),
        )
        .await
        .body["value"]
        .clone();
    assert_eq!(product["title"], "Laufrad");
    assert!(product.get("attributes").is_none());
    let mut missing = update.clone();
    missing["productId"] = json!(Uuid::new_v4());
    assert_eq!(
        app.mutation("products.updateProduct", missing, Some(&erika.session))
            .await
            .body["code"],
        "notFound.product"
    );

    app.mutation(
        "products.setProductReadyForSale",
        json!({ "productId": id, "readyForSale": false }),
        Some(&erika.session),
    )
    .await;
    assert_eq!(
        app.query("products.getProduct", json!({ "productId": id }), None)
            .await
            .body["value"]["readyForSale"],
        false
    );
    assert_eq!(
        app.mutation(
            "products.setProductReadyForSale",
            json!({ "productId": id, "readyForSale": true }),
            Some(&other.session)
        )
        .await
        .body["code"],
        "auth.forbidden"
    );

    assert_eq!(
        app.mutation(
            "products.deleteProduct",
            json!({ "id": id }),
            Some(&other.session)
        )
        .await
        .body["code"],
        "auth.forbidden"
    );
    assert_eq!(
        app.query(
            "products.canDeleteProduct",
            json!({ "productId": id }),
            Some(&erika.session)
        )
        .await
        .body["value"],
        true
    );
    app.mutation(
        "products.deleteProduct",
        json!({ "id": id }),
        Some(&erika.session),
    )
    .await;
    assert_eq!(
        app.query("products.getProduct", json!({ "productId": id }), None)
            .await
            .body["value"],
        Value::Null
    );
    assert_eq!(
        app.mutation(
            "products.deleteProduct",
            json!({ "id": id }),
            Some(&erika.session)
        )
        .await
        .body["code"],
        "notFound.product"
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn announcing_needs_a_photo_where_the_event_requires_one(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let erika = seller(&db, "Erika").await;
    let category = fixtures::category(&db, "Spielzeug").await;
    let strict = fixtures::event(&db, EventSpec::new("Mit Fotos", organizer)).await;
    let relaxed = fixtures::event(
        &db,
        EventSpec {
            features: json!({ "photosOptional": true }),
            ..EventSpec::new("Ohne", organizer)
        },
    )
    .await;
    let item = add(&app, &erika, product_args(&erika, category, vec![])).await;

    assert_eq!(
        announce(&app, &erika, relaxed, item).await.status,
        StatusCode::OK
    );
    let rejected = announce(&app, &erika, strict, item).await;
    assert_eq!(rejected.body["code"], "product.incomplete");
    assert!(rejected.body["message"].as_str().unwrap().contains("Foto"));

    let other = seller(&db, "Other").await;
    let image = photo(&app, &erika).await;
    assert_eq!(
        app.mutation(
            "products.addProductImages",
            json!({ "productId": item, "images": [image] }),
            Some(&other.session)
        )
        .await
        .body["code"],
        "auth.forbidden"
    );
    app.mutation(
        "products.addProductImages",
        json!({ "productId": item, "images": [image] }),
        Some(&erika.session),
    )
    .await;
    assert_eq!(
        announce(&app, &erika, strict, item).await.status,
        StatusCode::OK
    );

    // The last photo stays while the event needs it
    let mut update = product_args(&erika, category, vec![]);
    update["productId"] = json!(item);
    update.as_object_mut().unwrap().remove("vendorId");
    update.as_object_mut().unwrap().remove("sold");
    let reply = app
        .mutation("products.updateProduct", update, Some(&erika.session))
        .await;
    assert_eq!(reply.body["code"], "product.photoRequired");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn required_fields_apply_where_the_category_has_them(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let erika = seller(&db, "Erika").await;
    let bikes = fixtures::category(&db, "Fahrräder").await;
    let toys = fixtures::category(&db, "Spielzeug").await;
    let event = fixtures::event(
        &db,
        EventSpec {
            features: json!({ "photosOptional": true, "requiredFields": ["frameNumber"] }),
            ..EventSpec::new("Radmarkt", organizer)
        },
    )
    .await;
    let bike = add(&app, &erika, product_args(&erika, bikes, vec![])).await;
    let toy = add(&app, &erika, product_args(&erika, toys, vec![])).await;

    assert_eq!(
        announce(&app, &erika, event, toy).await.status,
        StatusCode::OK
    );
    let rejected = announce(&app, &erika, event, bike).await;
    assert!(
        rejected.body["message"]
            .as_str()
            .unwrap()
            .contains("Rahmennummer")
    );
    let other = seller(&db, "Other").await;
    let attrs = json!({ "productId": bike, "attributes": { "frameNumber": "WBK1" } });
    assert_eq!(
        app.mutation(
            "products.addProductAttributes",
            attrs.clone(),
            Some(&other.session)
        )
        .await
        .body["code"],
        "auth.forbidden"
    );
    app.mutation("products.addProductAttributes", attrs, Some(&erika.session))
        .await;
    assert_eq!(
        announce(&app, &erika, event, bike).await.status,
        StatusCode::OK
    );

    let mut update = product_args(&erika, bikes, vec![]);
    update["productId"] = json!(bike);
    update.as_object_mut().unwrap().remove("vendorId");
    update.as_object_mut().unwrap().remove("sold");
    let reply = app
        .mutation("products.updateProduct", update, Some(&erika.session))
        .await;
    assert_eq!(reply.body["code"], "product.fieldRequired");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn sellers_only_announce_and_never_set_another_status(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let erika = seller(&db, "Erika").await;
    let category = fixtures::category(&db, "Spielzeug").await;
    let event = fixtures::event(
        &db,
        EventSpec {
            features: json!({ "photosOptional": true }),
            ..EventSpec::new("Basar", organizer)
        },
    )
    .await;
    let item = add(&app, &erika, product_args(&erika, category, vec![])).await;
    let sold = app
        .mutation(
            "eventProducts.addProductToEvent",
            json!({ "eventId": event, "productId": item, "status": "sold" }),
            Some(&erika.session),
        )
        .await;
    assert_eq!(sold.body["code"], "auth.forbidden");
    let announced = app
        .mutation(
            "eventProducts.addProductToEvent",
            json!({ "eventId": event, "productId": item, "status": "announced" }),
            Some(&erika.session),
        )
        .await;
    assert_eq!(announced.status, StatusCode::OK);
    // Again: the same relation
    assert_eq!(
        announce(&app, &erika, event, item).await.body["value"],
        announced.body["value"]
    );
    assert_eq!(
        status_of(&db, event, item).await.as_deref(),
        Some("announced")
    );

    let past = fixtures::event(
        &db,
        EventSpec {
            start_hours: -10,
            end_hours: -5,
            ..EventSpec::new("Vorbei", organizer)
        },
    )
    .await;
    assert_eq!(
        announce(&app, &erika, past, item).await.body["code"],
        "product.pastNoAdd"
    );
    let other = seller(&db, "Other").await;
    assert_eq!(
        announce(&app, &other, event, item).await.body["code"],
        "auth.forbidden"
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_item_limit_of_an_event(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let erika = seller(&db, "Erika").await;
    let category = fixtures::category(&db, "Spielzeug").await;
    let event = fixtures::event(
        &db,
        EventSpec {
            features: json!({ "photosOptional": true, "maxItemsPerSeller": 2 }),
            ..EventSpec::new("Basar", organizer)
        },
    )
    .await;
    for _ in 0..2 {
        let item = add(&app, &erika, product_args(&erika, category, vec![])).await;
        assert_eq!(
            announce(&app, &erika, event, item).await.status,
            StatusCode::OK
        );
    }
    let third = add(&app, &erika, product_args(&erika, category, vec![])).await;
    let reply = announce(&app, &erika, event, third).await;
    assert_eq!(reply.body["code"], "seller.itemLimit");
    assert_eq!(
        reply.body["params"],
        json!({ "event": "Basar", "limit": "2", "left": "0" })
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn handed_in_items_are_locked_until_returned_or_the_bazaar_ends(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let erika = seller(&db, "Erika").await;
    let category = fixtures::category(&db, "Spielzeug").await;
    let event = fixtures::event(
        &db,
        EventSpec {
            start_hours: -1,
            end_hours: 5,
            features: json!({ "photosOptional": true }),
            ..EventSpec::new("Läuft", organizer)
        },
    )
    .await;
    let item = add(&app, &erika, product_args(&erika, category, vec![])).await;
    announce(&app, &erika, event, item).await;
    set_status(&db, event, item, "available").await;

    let locked = || {
        app.query(
            "eventProducts.isProductLockedForSeller",
            json!({ "productId": item }),
            None,
        )
    };
    assert_eq!(locked().await.body["value"], true);
    let mut update = product_args(&erika, category, vec![]);
    update["productId"] = json!(item);
    update.as_object_mut().unwrap().remove("vendorId");
    update.as_object_mut().unwrap().remove("sold");
    assert_eq!(
        app.mutation(
            "products.updateProduct",
            update.clone(),
            Some(&erika.session)
        )
        .await
        .body["code"],
        "product.locked"
    );
    assert_eq!(
        app.query(
            "products.canDeleteProduct",
            json!({ "productId": item }),
            Some(&erika.session)
        )
        .await
        .body["value"],
        false
    );
    let delete = app
        .mutation(
            "products.deleteProduct",
            json!({ "id": item }),
            Some(&erika.session),
        )
        .await;
    assert_eq!(delete.body["code"], "product.acceptedNoDelete");
    // Handed in items cannot be withdrawn by the seller
    let remove = app
        .mutation(
            "eventProducts.removeProductFromEvent",
            json!({ "eventId": event, "productId": item }),
            Some(&erika.session),
        )
        .await;
    assert_eq!(remove.body["code"], "product.acceptedNoRemove");

    // Returned: back with the seller, editable and deletable
    set_status(&db, event, item, "returned").await;
    assert_eq!(locked().await.body["value"], false);
    assert_eq!(
        app.mutation("products.updateProduct", update, Some(&erika.session))
            .await
            .status,
        StatusCode::OK
    );
    app.mutation(
        "products.deleteProduct",
        json!({ "id": item }),
        Some(&erika.session),
    )
    .await;
    let left: i64 = sqlx::query_scalar("SELECT count(*) FROM products WHERE id = $1")
        .bind(item)
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(left, 0);
    let mine = app
        .query("products.getMyProducts", json!({}), Some(&erika.session))
        .await;
    assert_eq!(mine.body["value"], json!([]));
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn set_product_events_replaces_announcements_only(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let erika = seller(&db, "Erika").await;
    let category = fixtures::category(&db, "Spielzeug").await;
    let spec = |title| EventSpec {
        features: json!({ "photosOptional": true }),
        ..EventSpec::new(title, organizer)
    };
    let (a, b, c) = (
        fixtures::event(&db, spec("A")).await,
        fixtures::event(&db, spec("B")).await,
        fixtures::event(&db, spec("C")).await,
    );
    let item = add(&app, &erika, product_args(&erika, category, vec![])).await;
    let set = |events: Vec<Uuid>| {
        let (app, session, args) = (
            &app,
            erika.session.clone(),
            json!({ "productId": item, "eventIds": events }),
        );
        async move {
            app.mutation("eventProducts.setProductEvents", args, Some(&session))
                .await
        }
    };
    set(vec![a, b]).await;
    set_status(&db, b, item, "available").await;
    // Deselecting B keeps its intake, A goes, C is new
    let reply = set(vec![c]).await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(status_of(&db, a, item).await, None);
    assert_eq!(status_of(&db, b, item).await.as_deref(), Some("available"));
    assert_eq!(status_of(&db, c, item).await.as_deref(), Some("announced"));
    let ids = app
        .query(
            "eventProducts.getEventIdsForProduct",
            json!({ "productId": item }),
            None,
        )
        .await;
    assert_eq!(ids.body["value"], json!([b, c]));

    let past = fixtures::event(
        &db,
        EventSpec {
            start_hours: -10,
            end_hours: -5,
            ..spec("Vorbei")
        },
    )
    .await;
    assert_eq!(set(vec![c, past]).await.body["code"], "product.pastNoLink");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn who_sees_which_items_of_an_event(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let erika = seller(&db, "Erika").await;
    let category = fixtures::category(&db, "Spielzeug").await;
    let event = fixtures::event(
        &db,
        EventSpec {
            features: json!({ "photosOptional": true }),
            ..EventSpec::new("Basar", organizer)
        },
    )
    .await;
    let ready = add(&app, &erika, product_args(&erika, category, vec![])).await;
    let mut draft_args = product_args(&erika, category, vec![]);
    draft_args["readyForSale"] = json!(false);
    draft_args["minimumPrice"] = json!(10);
    let draft = add(&app, &erika, draft_args).await;
    announce(&app, &erika, event, ready).await;
    announce(&app, &erika, event, draft).await;
    let ids = |reply: common::Reply| -> Vec<Value> {
        reply.body["value"]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| p["_id"].clone())
            .collect()
    };

    assert_eq!(
        ids(app
            .query(
                "eventProducts.getProductsForEvent",
                json!({ "eventId": event }),
                None
            )
            .await),
        vec![json!(ready)]
    );
    let own = app
        .query(
            "eventProducts.getProductsForEvent",
            json!({ "eventId": event }),
            Some(&erika.session),
        )
        .await;
    assert_eq!(own.body["value"].as_array().unwrap().len(), 2);
    assert!(own.body["value"][1].get("minimumPrice").is_none());
    assert_eq!(own.body["value"][0]["status"], "announced");

    let manage = |session: Option<String>| {
        let app = &app;
        async move {
            app.query(
                "eventProducts.getProductsForEventManagement",
                json!({ "eventId": event }),
                session.as_deref(),
            )
            .await
        }
    };
    assert_eq!(
        manage(Some(erika.session.clone())).await.body["code"],
        "auth.forbidden"
    );
    let team = manage(Some(fixtures::session(&db, organizer).await)).await;
    assert_eq!(team.body["value"][1]["minimumPrice"], 10.0);
    let detail = app
        .query(
            "eventProducts.getEventProduct",
            json!({ "eventId": event, "productId": ready }),
            Some(&fixtures::session(&db, organizer).await),
        )
        .await;
    assert_eq!(detail.body["value"]["vendor"]["name"], "Erika");
    assert_eq!(detail.body["value"]["product"]["title"], "Kinderfahrrad");
    assert_eq!(detail.body["value"]["status"], "announced");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn intake_return_and_undo_by_the_team(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let team = fixtures::session(&db, organizer).await;
    let erika = seller(&db, "Erika").await;
    let category = fixtures::category(&db, "Spielzeug").await;
    let event = fixtures::event(
        &db,
        EventSpec {
            features: json!({ "photosOptional": true }),
            ..EventSpec::new("Basar", organizer)
        },
    )
    .await;
    fixtures::role(&db, event, erika.id, "seller").await;
    let (a, b) = (
        add(&app, &erika, product_args(&erika, category, vec![])).await,
        add(&app, &erika, product_args(&erika, category, vec![])).await,
    );
    announce(&app, &erika, event, a).await;
    announce(&app, &erika, event, b).await;
    let args = json!({ "eventId": event, "vendorId": erika.id });
    assert_eq!(
        app.mutation(
            "eventProducts.markAllVendorProductsAvailable",
            args.clone(),
            Some(&erika.session)
        )
        .await
        .body["code"],
        "auth.forbidden"
    );
    assert_eq!(
        app.mutation(
            "eventProducts.markAllVendorProductsAvailable",
            args.clone(),
            Some(&team)
        )
        .await
        .body["value"],
        json!({ "updatedCount": 2 })
    );
    assert_eq!(
        app.mutation(
            "eventProducts.markAllVendorProductsReturned",
            args.clone(),
            Some(&team)
        )
        .await
        .body["value"],
        json!({ "updatedCount": 2 })
    );

    let relation: Uuid = sqlx::query_scalar("SELECT id FROM event_products WHERE product_id = $1")
        .bind(a)
        .fetch_one(&db)
        .await
        .unwrap();
    assert_eq!(
        app.mutation(
            "eventProducts.undoReturn",
            json!({ "eventProductId": relation }),
            Some(&team)
        )
        .await
        .body["code"],
        "feature.disabled"
    );
    sqlx::query(
        "INSERT INTO feature_flags (key, value) VALUES ('allow_undo_inventory_actions', true)",
    )
    .execute(&db)
    .await
    .unwrap();
    assert_eq!(
        app.mutation(
            "eventProducts.undoReturn",
            json!({ "eventProductId": relation }),
            Some(&team)
        )
        .await
        .body["value"],
        json!({ "success": true })
    );
    assert_eq!(status_of(&db, event, a).await.as_deref(), Some("available"));
    assert_eq!(
        app.mutation(
            "eventProducts.undoReturn",
            json!({ "eventProductId": relation }),
            Some(&team)
        )
        .await
        .body["code"],
        "product.notReturned"
    );

    // A location only with the intake, and only one of the event
    let location: Uuid = sqlx::query_scalar(
        "INSERT INTO event_location_categories (event_id, label) VALUES ($1, 'Halle') RETURNING id",
    )
    .bind(event)
    .fetch_one(&db)
    .await
    .unwrap();
    let with_location = |status: &str, location: Uuid| json!({ "eventProductId": relation, "status": status, "locationCategoryId": location });
    assert_eq!(
        app.mutation(
            "eventProducts.updateProductStatus",
            with_location("returned", location),
            Some(&team)
        )
        .await
        .body["code"],
        "event.locationOnlyOnAccept"
    );
    assert_eq!(
        app.mutation(
            "eventProducts.updateProductStatus",
            with_location("available", Uuid::new_v4()),
            Some(&team)
        )
        .await
        .body["code"],
        "event.invalidLocationCategory"
    );
    app.mutation(
        "eventProducts.updateProductStatus",
        with_location("available", location),
        Some(&team),
    )
    .await;
    let locations = app
        .query(
            "eventProducts.getEventLocationsForProduct",
            json!({ "productId": a }),
            None,
        )
        .await;
    assert_eq!(
        locations.body["value"],
        json!([{ "eventId": event, "locationLabel": "Halle" }])
    );

    app.mutation(
        "eventProducts.setEventProductNote",
        json!({ "eventProductId": relation, "note": " Haken 12 " }),
        Some(&team),
    )
    .await;
    let note: Option<String> =
        sqlx::query_scalar("SELECT internal_note FROM event_products WHERE id = $1")
            .bind(relation)
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(note.as_deref(), Some("Haken 12"));
    assert_eq!(
        app.mutation(
            "eventProducts.setEventProductNote",
            json!({ "eventProductId": relation, "note": "x" }),
            Some(&erika.session)
        )
        .await
        .body["code"],
        "auth.forbidden"
    );

    // Paid out: no more changes to the seller's items
    sqlx::query("INSERT INTO event_sellers (event_id, user_id, total_fee, commission_fee, payout_amount, payout_received) VALUES ($1, $2, 0, 0, 0, true)")
        .bind(event)
        .bind(erika.id)
        .execute(&db)
        .await
        .unwrap();
    let reply = app
        .mutation(
            "eventProducts.updateProductStatus",
            json!({ "eventProductId": relation, "status": "returned" }),
            Some(&team),
        )
        .await;
    assert_eq!(reply.body["code"], "seller.paidOutUndoFirst");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn discounts_during_the_running_event(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let erika = seller(&db, "Erika").await;
    let category = fixtures::category(&db, "Spielzeug").await;
    let running = fixtures::event(
        &db,
        EventSpec {
            start_hours: -1,
            end_hours: 5,
            features: json!({ "photosOptional": true, "maxDiscountPercent": 30 }),
            ..EventSpec::new("Läuft", organizer)
        },
    )
    .await;
    let item = add(&app, &erika, product_args(&erika, category, vec![])).await;
    announce(&app, &erika, running, item).await;
    let discount = |percent: f64| {
        let (app, session, args) = (
            &app,
            erika.session.clone(),
            json!({ "eventId": running, "productId": item, "discountPercent": percent }),
        );
        async move {
            app.mutation("eventProducts.updateProductDiscount", args, Some(&session))
                .await
                .body
        }
    };
    assert_eq!(discount(10.0).await["code"], "discount.onlyAvailable");
    set_status(&db, running, item, "available").await;
    assert_eq!(discount(40.0).await["code"], "discount.max");
    assert_eq!(discount(20.0).await["value"], Value::Null);
    assert_eq!(discount(10.0).await["code"], "discount.onlyIncrease");
    let product = app
        .query(
            "products.getProduct",
            json!({ "productId": item }),
            Some(&erika.session),
        )
        .await
        .body["value"]
        .clone();
    assert_eq!(product["discountPercent"], 20.0);
    assert_eq!(
        product["discountRules"],
        json!({ "allowed": true, "maxDiscountPercent": 30 })
    );
    assert_eq!(
        (
            product["eventStatus"].clone(),
            product["isAvailable"].clone(),
            product["isLocked"].clone()
        ),
        (json!("available"), json!(true), json!(true))
    );

    let upcoming = fixtures::event(
        &db,
        EventSpec {
            features: json!({ "photosOptional": true }),
            ..EventSpec::new("Bald", organizer)
        },
    )
    .await;
    let other = add(&app, &erika, product_args(&erika, category, vec![])).await;
    announce(&app, &erika, upcoming, other).await;
    let reply = app
        .mutation(
            "eventProducts.updateProductDiscount",
            json!({ "eventId": upcoming, "productId": other, "discountPercent": 10 }),
            Some(&erika.session),
        )
        .await;
    assert_eq!(reply.body["code"], "discount.notRunning");
    let none = fixtures::event(
        &db,
        EventSpec {
            start_hours: -1,
            end_hours: 5,
            features: json!({ "discounts": false }),
            ..EventSpec::new("Ohne", organizer)
        },
    )
    .await;
    let reply = app
        .mutation(
            "eventProducts.updateProductDiscount",
            json!({ "eventId": none, "productId": other, "discountPercent": 10 }),
            Some(&erika.session),
        )
        .await;
    assert_eq!(reply.body["code"], "discount.none");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn my_products_with_offers_questions_and_sales(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let erika = seller(&db, "Erika").await;
    let buyer = fixtures::user(&db, "Buyer").await;
    let category = fixtures::category(&db, "Spielzeug").await;
    let event = fixtures::event(
        &db,
        EventSpec {
            features: json!({ "photosOptional": true }),
            ..EventSpec::new("Basar", organizer)
        },
    )
    .await;
    let open = add(&app, &erika, product_args(&erika, category, vec![])).await;
    let relation: Uuid =
        serde_json::from_value(announce(&app, &erika, event, open).await.body["value"].clone())
            .unwrap();
    sqlx::query("INSERT INTO product_offers (event_id, product_id, event_product_id, buyer_id, amount, status) VALUES ($1, $2, $3, $4, 30, 'pending')")
        .bind(event).bind(open).bind(relation).bind(buyer).execute(&db).await.unwrap();
    sqlx::query("INSERT INTO product_questions (event_id, product_id, asker_id, question) VALUES ($1, $2, $3, 'Größe?')")
        .bind(event).bind(open).bind(buyer).execute(&db).await.unwrap();
    let sold = add(&app, &erika, product_args(&erika, category, vec![])).await;
    sqlx::query("UPDATE products SET sold = true WHERE id = $1")
        .bind(sold)
        .execute(&db)
        .await
        .unwrap();
    fixtures::purchase(&db, event, sold, erika.id, (40.0, 4.0, 36.0)).await;

    let mine = app
        .query("products.getMyProducts", json!({}), Some(&erika.session))
        .await
        .body["value"]
        .clone();
    let open = mine
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["_id"] == json!(open))
        .unwrap();
    assert_eq!(
        (
            open["pendingOfferCount"].clone(),
            open["unansweredQuestionCount"].clone()
        ),
        (json!(1), json!(1))
    );
    assert_eq!(open["eventIds"], json!([event]));
    assert_eq!(
        (open["isLocked"].clone(), open["canDelete"].clone()),
        (json!(false), json!(true))
    );
    let sold = mine
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["_id"] == json!(sold))
        .unwrap();
    assert_eq!(sold["isLocked"], true);
    assert_eq!(sold["sale"]["totalAmount"], 40.0);
    assert_eq!(sold["sale"]["payout"], 36.0);
    assert_eq!(sold["sale"]["priceSource"], "list");
    assert_eq!(
        app.query("products.getMyProducts", json!({}), None)
            .await
            .body["code"],
        "auth.required"
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn organizers_see_the_seller_and_hidden_items_are_hidden(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let erika = seller(&db, "Erika").await;
    let category = fixtures::category(&db, "Spielzeug").await;
    let event = fixtures::event(
        &db,
        EventSpec {
            features: json!({ "photosOptional": true }),
            ..EventSpec::new("Basar", organizer)
        },
    )
    .await;
    let item = add(&app, &erika, product_args(&erika, category, vec![])).await;
    announce(&app, &erika, event, item).await;
    sqlx::query(
        "UPDATE users SET first_name = 'Erika', last_name = 'Muster', phone = '0731' WHERE id = $1",
    )
    .bind(erika.id)
    .execute(&db)
    .await
    .unwrap();

    let public = app
        .query("products.getProduct", json!({ "productId": item }), None)
        .await
        .body["value"]
        .clone();
    assert!(public.get("vendorFirstName").is_none());
    assert_eq!(public["isOrganizer"], false);
    assert_eq!(public["activeListing"]["eventTitle"], "Basar");
    assert_eq!(public["activeListing"]["features"]["photosOptional"], true);
    let as_organizer = fixtures::session(&db, organizer).await;
    let team = app
        .query(
            "products.getProduct",
            json!({ "productId": item }),
            Some(&as_organizer),
        )
        .await
        .body["value"]
        .clone();
    assert_eq!(
        (
            team["vendorFirstName"].clone(),
            team["vendorLastName"].clone(),
            team["vendorPhone"].clone()
        ),
        (json!("Erika"), json!("Muster"), json!("0731"))
    );
    assert_eq!(team["organizerEventId"], json!(event));

    sqlx::query(
        "UPDATE products SET hidden_at = now(), hidden_by = $2, hidden_reason = 'x' WHERE id = $1",
    )
    .bind(item)
    .bind(organizer)
    .execute(&db)
    .await
    .unwrap();
    assert_eq!(
        app.query("products.getProduct", json!({ "productId": item }), None)
            .await
            .body["value"],
        Value::Null
    );
    assert_eq!(
        app.query(
            "products.getProduct",
            json!({ "productId": item }),
            Some(&erika.session)
        )
        .await
        .body["value"]["moderation"]["reason"],
        "x"
    );
    assert!(
        app.query("products.get", json!({}), None).await.body["value"]
            .as_array()
            .unwrap()
            .is_empty()
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_bazaar_keeping_a_record_fixes_seller_and_item_data(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let as_organizer = fixtures::session(&db, organizer).await;
    let anna = seller(&db, "Anna Rad").await;
    sqlx::query(
        "UPDATE users SET first_name = 'Anna', last_name = 'Rad', phone = '0731 123', street = 'Münsterplatz 1',
           zip_code = '89073', city = 'Ulm', country = 'Deutschland' WHERE id = $1",
    )
    .bind(anna.id)
    .execute(&db)
    .await
    .unwrap();
    let bikes = fixtures::category(&db, "Fahrräder").await;
    let now = chrono::Utc::now().timestamp_millis() as f64;
    let event: Uuid = app
        .mutation(
            "events.createEvent",
            json!({
                "title": "Fahrradmarkt", "description": "", "location": "Münsterplatz",
                "startDate": now + 24.0 * 3_600_000.0, "endDate": now + 30.0 * 3_600_000.0,
                "categories": [bikes], "services": [], "contactInfo": "orga@test.de", "commission": 20,
                "visibility": "logged-in",
                "features": { "photosOptional": true, "privateSellersOnly": true, "fixedSellerData": true }
            }),
            Some(&as_organizer),
        )
        .await
        .body["value"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    app.mutation(
        "eventSeller.joinEvent",
        json!({ "eventId": event, "privateSeller": true }),
        Some(&anna.session),
    )
    .await;
    let mut args = product_args(&anna, bikes, vec![]);
    args["title"] = json!("Trekkingrad");
    args["price"] = json!(150);
    args["attributes"] = json!({ "frameNumber": "WBK123" });
    let bike = add(&app, &anna, args).await;
    let announced = announce(&app, &anna, event, bike).await;
    assert_eq!(announced.status, StatusCode::OK);
    let relation = announced.body["value"].clone();
    let fixed_profile = || app.query("users.isMyProfileFixed", json!({}), Some(&anna.session));
    let recorded = || async {
        app.query(
            "eventRoles.getVendorsForEvent",
            json!({ "eventId": event }),
            Some(&as_organizer),
        )
        .await
        .body["value"][0]["detailsRecorded"]
            .clone()
    };

    // Announced only: the organizer checks the details against the ID card, the seller may
    // still correct them and the item
    assert_eq!(fixed_profile().await.body["value"], false);
    assert_eq!(recorded().await, false);
    assert_eq!(
        app.mutation(
            "users.update",
            json!({ "street": "Münsterplatz 1a" }),
            Some(&anna.session)
        )
        .await
        .status,
        StatusCode::OK
    );
    let mut update = product_args(&anna, bikes, vec![]);
    update["productId"] = json!(bike);
    update.as_object_mut().unwrap().remove("vendorId");
    update.as_object_mut().unwrap().remove("sold");
    update["title"] = json!("Trekkingrad");
    update["price"] = json!(150);
    update["attributes"] = json!({ "frameNumber": "WBK123" });
    assert_eq!(
        app.mutation(
            "products.updateProduct",
            update.clone(),
            Some(&anna.session)
        )
        .await
        .status,
        StatusCode::OK
    );

    // Accepted on site: seller and item are recorded and fixed
    let accept = app
        .mutation(
            "eventProducts.updateProductStatus",
            json!({ "eventProductId": relation, "status": "available" }),
            Some(&as_organizer),
        )
        .await;
    assert_eq!(accept.status, StatusCode::OK, "{}", accept.body);
    let snapshot: Value =
        sqlx::query_scalar("SELECT seller_snapshot FROM event_sellers WHERE event_id = $1")
            .bind(event)
            .fetch_one(&db)
            .await
            .unwrap();
    assert_eq!(
        (
            snapshot["lastName"].clone(),
            snapshot["street"].clone(),
            snapshot["email"].clone()
        ),
        (
            json!("Rad"),
            json!("Münsterplatz 1a"),
            json!("anna.rad@test.example")
        )
    );
    assert_eq!(fixed_profile().await.body["value"], true);
    assert_eq!(recorded().await, true);

    // Handed in, the item is locked anyway. Returned during the bazaar, title, price and
    // required fields stay fixed; the description does not
    let returned = app
        .mutation(
            "eventProducts.updateProductStatus",
            json!({ "eventProductId": relation, "status": "returned" }),
            Some(&as_organizer),
        )
        .await;
    assert_eq!(returned.status, StatusCode::OK, "{}", returned.body);
    update["description"] = json!("Neu: mit Licht");
    let described = app
        .mutation(
            "products.updateProduct",
            update.clone(),
            Some(&anna.session),
        )
        .await;
    assert_eq!(described.status, StatusCode::OK, "{}", described.body);
    update["price"] = json!(140);
    assert_eq!(
        app.mutation(
            "products.updateProduct",
            update.clone(),
            Some(&anna.session)
        )
        .await
        .body["code"],
        "product.dataFixed"
    );
    let fixed = app
        .query(
            "eventProducts.getFixedItemData",
            json!({ "productId": bike }),
            None,
        )
        .await;
    assert_eq!(
        fixed.body["value"],
        json!({ "fixed": true, "fieldKeys": [] })
    );

    // Taken in again and sold: later profile changes do not reach the record, the sale is
    // linked to it
    let again = app
        .mutation(
            "eventProducts.updateProductStatus",
            json!({ "eventProductId": relation, "status": "available" }),
            Some(&as_organizer),
        )
        .await;
    assert_eq!(again.status, StatusCode::OK, "{}", again.body);
    sqlx::query("UPDATE users SET street = 'Später 9' WHERE id = $1")
        .bind(anna.id)
        .execute(&db)
        .await
        .unwrap();
    sqlx::query("UPDATE events SET start_date = now() - interval '1 hour' WHERE id = $1")
        .bind(event)
        .execute(&db)
        .await
        .unwrap();
    let sale = app
        .mutation(
            "purchases.sellProduct",
            json!({ "eventProductId": relation }),
            Some(&as_organizer),
        )
        .await;
    assert_eq!(sale.status, StatusCode::OK, "{}", sale.body);
    assert_eq!(
        app.query(
            "sellerRecords.getProofOfOffers",
            json!({ "eventId": event }),
            Some(&anna.session)
        )
        .await
        .body["code"],
        "auth.forbidden"
    );
    let proof = app
        .query(
            "sellerRecords.getProofOfOffers",
            json!({ "eventId": event }),
            Some(&as_organizer),
        )
        .await
        .body["value"]
        .clone();
    assert_eq!(proof["items"].as_array().unwrap().len(), 1);
    let item = &proof["items"][0];
    assert_eq!(
        (
            item["title"].clone(),
            item["category"].clone(),
            item["price"].clone(),
            item["status"].clone(),
            item["soldFor"].clone()
        ),
        (
            json!("Trekkingrad"),
            json!("Fahrräder"),
            json!(150.0),
            json!("sold"),
            json!(150.0)
        )
    );
    assert_eq!(item["attributes"][0]["value"], "WBK123");
    assert_eq!(
        (
            item["seller"]["sellerNumber"].clone(),
            item["seller"]["street"].clone(),
            item["seller"]["fromRecord"].clone()
        ),
        (json!(1), json!("Münsterplatz 1a"), json!(true))
    );
    assert!(item["seller"]["privateSellerConfirmedAt"].is_f64());
    assert_eq!(proof["event"]["title"], "Fahrradmarkt");
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_proof_lists_accepted_items_also_after_the_seller_deleted_them(db: PgPool) {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let team = fixtures::session(&db, organizer).await;
    let erika = seller(&db, "Erika").await;
    let category = fixtures::category(&db, "Spielzeug").await;
    let event = fixtures::event(
        &db,
        EventSpec {
            start_hours: -1,
            end_hours: 5,
            features: json!({ "photosOptional": true, "fixedSellerData": true }),
            ..EventSpec::new("Nachweis", organizer)
        },
    )
    .await;
    fixtures::role(&db, event, erika.id, "seller").await;
    fixtures::event_seller(&db, event, erika.id, 4, false).await;
    let mut args = product_args(&erika, category, vec![]);
    args["title"] = json!("Roller");
    let accepted = add(&app, &erika, args).await;
    let mut args = product_args(&erika, category, vec![]);
    args["title"] = json!("Nie gebracht");
    let missing = add(&app, &erika, args).await;
    let relation = announce(&app, &erika, event, accepted).await.body["value"].clone();
    announce(&app, &erika, event, missing).await;
    let status = |status: &str| {
        app.mutation(
            "eventProducts.updateProductStatus",
            json!({ "eventProductId": relation, "status": status }),
            Some(&team),
        )
    };
    assert_eq!(status("available").await.status, StatusCode::OK);

    // Not handed in: the seller may still withdraw it after the start
    let withdraw = app
        .mutation(
            "eventProducts.removeProductFromEvent",
            json!({ "eventId": event, "productId": missing }),
            Some(&erika.session),
        )
        .await;
    assert_eq!(withdraw.status, StatusCode::OK, "{}", withdraw.body);

    // Returned and deleted: the record stays
    assert_eq!(status("returned").await.status, StatusCode::OK);
    let delete = app
        .mutation(
            "products.deleteProduct",
            json!({ "id": accepted }),
            Some(&erika.session),
        )
        .await;
    assert_eq!(delete.status, StatusCode::OK, "{}", delete.body);
    assert_eq!(status_of(&db, event, accepted).await, None);
    let proof = app
        .query(
            "sellerRecords.getProofOfOffers",
            json!({ "eventId": event }),
            Some(&team),
        )
        .await
        .body["value"]["items"]
        .clone();
    assert_eq!(proof.as_array().unwrap().len(), 1, "{proof}");
    assert_eq!(
        (
            proof[0]["title"].clone(),
            proof[0]["status"].clone(),
            proof[0]["productId"].clone(),
            proof[0]["seller"]["sellerNumber"].clone()
        ),
        (json!("Roller"), json!("returned"), Value::Null, json!(4))
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn upload_url_and_image_urls(db: PgPool) {
    let app = TestApp::new(db.clone());
    let erika = seller(&db, "Erika").await;
    assert_eq!(
        app.mutation("products.generateUploadUrl", json!({}), None)
            .await
            .body["code"],
        "auth.loginToUpload"
    );
    let url = app
        .mutation(
            "products.generateUploadUrl",
            json!({}),
            Some(&erika.session),
        )
        .await;
    assert_eq!(url.body["value"], "https://bazarpro.test/api/files");
    let image = photo(&app, &erika).await;
    let urls = app
        .query(
            "products.getImageUrls",
            json!({ "storageIds": [image, Uuid::new_v4()] }),
            None,
        )
        .await;
    assert_eq!(
        urls.body["value"],
        json!([format!(
            "https://bazarpro.test/api/files/{}",
            image.as_str().unwrap()
        )])
    );
}
