//! Questions on items.

mod common;

use axum::http::StatusCode;
use common::TestApp;
use common::fixtures::{self, EventSpec};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

struct Setup {
    app: TestApp,
    db: PgPool,
    product: Uuid,
    seller: String,
    buyer: String,
    organizer: String,
}

async fn setup(db: PgPool, features: Value, start_hours: i32) -> Setup {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let event = fixtures::event(
        &db,
        EventSpec {
            start_hours,
            end_hours: 30,
            features,
            ..EventSpec::new("Basar", organizer)
        },
    )
    .await;
    let seller = fixtures::user(&db, "Seller").await;
    let product = fixtures::product(&db, seller, "Rad", 100.0).await;
    fixtures::event_product(&db, event, product, "announced").await;
    Setup {
        seller: fixtures::session(&db, seller).await,
        buyer: fixtures::session(&db, fixtures::user(&db, "Buyer").await).await,
        organizer: fixtures::session(&db, organizer).await,
        app,
        db,
        product,
    }
}

impl Setup {
    async fn ask(&self, session: &str, question: &str) -> common::Reply {
        self.app
            .mutation(
                "productQuestions.ask",
                json!({ "productId": self.product, "question": question }),
                Some(session),
            )
            .await
    }
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn questions_need_the_event_feature(db: PgPool) {
    let s = setup(db, json!({}), 24).await;
    let reply = s.ask(&s.buyer, "Ist das Licht dabei?").await;
    assert!(
        reply.body["message"]
            .as_str()
            .unwrap()
            .contains("keine Fragen")
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn ask_answer_and_see_it_publicly(db: PgPool) {
    let s = setup(db, json!({ "questions": true }), 24).await;
    assert_eq!(
        s.app
            .mutation(
                "productQuestions.ask",
                json!({ "productId": s.product, "question": "Hallo?" }),
                None
            )
            .await
            .body["code"],
        "auth.loginToAsk"
    );
    assert_eq!(
        s.ask(&s.seller, "Eigene Frage").await.body["code"],
        "question.ownItem"
    );
    assert_eq!(
        s.ask(&s.buyer, "Ja").await.body["code"],
        "question.tooShort"
    );
    let question = s.ask(&s.buyer, "  Ist das Licht dabei?  ").await.body["value"].clone();
    let forbidden = s
        .app
        .mutation(
            "productQuestions.answer",
            json!({ "questionId": question, "answer": "Ja" }),
            Some(&s.buyer),
        )
        .await;
    assert_eq!(forbidden.body["code"], "auth.forbidden");
    let empty = s
        .app
        .mutation(
            "productQuestions.answer",
            json!({ "questionId": question, "answer": " " }),
            Some(&s.seller),
        )
        .await;
    assert_eq!(empty.body["code"], "question.answerEmpty");
    let answered = s
        .app
        .mutation(
            "productQuestions.answer",
            json!({ "questionId": question, "answer": "Ja, vorne und hinten" }),
            Some(&s.seller),
        )
        .await;
    assert_eq!(answered.status, StatusCode::OK);

    let public = s
        .app
        .query(
            "productQuestions.listForProduct",
            json!({ "productId": s.product }),
            None,
        )
        .await
        .body["value"]
        .clone();
    assert_eq!(public.as_array().unwrap().len(), 1);
    assert_eq!(
        (
            public[0]["question"].clone(),
            public[0]["answer"].clone(),
            public[0]["askerName"].clone()
        ),
        (
            json!("Ist das Licht dabei?"),
            json!("Ja, vorne und hinten"),
            json!("Buyer")
        )
    );
    assert_eq!(
        (public[0]["isMine"].clone(), public[0]["canAnswer"].clone()),
        (json!(false), json!(false))
    );
    let mine = s
        .app
        .query(
            "productQuestions.listForProduct",
            json!({ "productId": s.product }),
            Some(&s.buyer),
        )
        .await;
    assert_eq!(mine.body["value"][0]["isMine"], true);
    let sellers = s
        .app
        .query(
            "productQuestions.listForProduct",
            json!({ "productId": s.product }),
            Some(&s.seller),
        )
        .await;
    assert_eq!(sellers.body["value"][0]["canAnswer"], true);

    s.app.run_jobs().await;
    let mut to: Vec<String> = s
        .app
        .sent
        .lock()
        .unwrap()
        .iter()
        .map(|m| m.to.clone())
        .collect();
    to.sort();
    assert_eq!(to, vec!["buyer@test.example", "seller@test.example"]);
    // Editing the answer mails nobody again
    s.app
        .mutation(
            "productQuestions.answer",
            json!({ "questionId": question, "answer": "Ja, beide" }),
            Some(&s.seller),
        )
        .await;
    s.app.run_jobs().await;
    assert_eq!(s.app.sent.lock().unwrap().len(), 2);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn three_open_questions_per_user(db: PgPool) {
    let s = setup(db, json!({ "questions": true }), 24).await;
    for i in 0..3 {
        assert_eq!(
            s.ask(&s.buyer, &format!("Frage Nummer {i}")).await.status,
            StatusCode::OK
        );
    }
    assert_eq!(
        s.ask(&s.buyer, "Noch eine Frage").await.body["code"],
        "question.waitForAnswers"
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn questions_during_the_event_only(db: PgPool) {
    let s = setup(
        db.clone(),
        json!({ "questions": true, "questionsDuringEventOnly": true }),
        24,
    )
    .await;
    assert_eq!(
        s.ask(&s.buyer, "Schon vorher?").await.body["code"],
        "question.notYet"
    );
    sqlx::query("UPDATE events SET start_date = now() - interval '1 hour'")
        .execute(&s.db)
        .await
        .unwrap();
    assert_eq!(s.ask(&s.buyer, "Jetzt aber?").await.status, StatusCode::OK);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn only_asker_seller_or_organizer_may_delete(db: PgPool) {
    let s = setup(db.clone(), json!({ "questions": true }), 24).await;
    let question = s.ask(&s.buyer, "Ist das Licht dabei?").await.body["value"].clone();
    let stranger = fixtures::session(&db, fixtures::user(&db, "Fremd").await).await;
    assert_eq!(
        s.app
            .mutation(
                "productQuestions.remove",
                json!({ "questionId": question }),
                Some(&stranger)
            )
            .await
            .body["code"],
        "auth.forbidden"
    );
    s.app
        .mutation(
            "productQuestions.remove",
            json!({ "questionId": question }),
            Some(&s.organizer),
        )
        .await;
    assert_eq!(
        s.app
            .query(
                "productQuestions.listForProduct",
                json!({ "productId": s.product }),
                None
            )
            .await
            .body["value"],
        json!([])
    );
    // Removing again is fine
    assert_eq!(
        s.app
            .mutation(
                "productQuestions.remove",
                json!({ "questionId": question }),
                Some(&s.organizer)
            )
            .await
            .status,
        StatusCode::OK
    );
}
