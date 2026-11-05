//! Invitations by mail: who may send them, and who a link lets in.

use crate::common;

use axum::http::StatusCode;
use common::TestApp;
use common::fixtures::{self, EventSpec};
use serde_json::{Value, json};
use sqlx::PgPool;
use uuid::Uuid;

struct Setup {
    app: TestApp,
    db: PgPool,
    event: Uuid,
    organizer: String,
}

async fn setup(db: PgPool) -> Setup {
    let app = TestApp::new(db.clone());
    let organizer = fixtures::user(&db, "Orga").await;
    let event = fixtures::event(&db, EventSpec::new("Fahrradbörse", organizer)).await;
    Setup {
        organizer: fixtures::session(&db, organizer).await,
        app,
        db,
        event,
    }
}

impl Setup {
    /// Sends the invitation and returns the token from the link in the mail.
    async fn invite(&self, email: &str, helper: bool) -> String {
        let reply = self.send(email, helper).await;
        assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
        self.app.run_jobs().await;
        let sent = self.app.sent.lock().unwrap();
        let mail = sent.last().expect("no mail sent");
        assert_eq!(mail.to, email);
        assert!(mail.html.contains("Fahrradbörse"), "{}", mail.html);
        let start = mail.html.find("/invite/").expect("no link") + 8;
        let rest = &mail.html[start..];
        rest[..rest.find('"').unwrap()].to_owned()
    }

    async fn send(&self, email: &str, helper: bool) -> common::Reply {
        self.app
            .mutation(
                "eventInvitations.send",
                json!({ "eventId": self.event, "email": email, "helper": helper }),
                Some(&self.organizer),
            )
            .await
    }

    async fn accept(&self, user: Uuid, token: &str) -> common::Reply {
        self.app
            .mutation(
                "eventSeller.joinEvent",
                json!({ "eventId": self.event, "invitation": token }),
                Some(&fixtures::session(&self.db, user).await),
            )
            .await
    }

    async fn roles(&self, user: Uuid) -> Vec<String> {
        sqlx::query_scalar(
            "SELECT role::text FROM event_roles WHERE event_id = $1 AND user_id = $2 ORDER BY role",
        )
        .bind(self.event)
        .bind(user)
        .fetch_all(&self.db)
        .await
        .unwrap()
    }

    async fn open(&self) -> Value {
        self.app
            .query(
                "eventInvitations.listOpen",
                json!({ "eventId": self.event }),
                Some(&self.organizer),
            )
            .await
            .body["value"]
            .clone()
    }
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_helper_invitation_makes_the_invited_account_helper_once(db: PgPool) {
    let s = setup(db).await;
    let token = s.invite("hanna@test.example", true).await;
    assert_eq!(s.open().await.as_array().unwrap().len(), 1);

    // The link alone shows the bazaar, also without an account
    let view = s
        .app
        .query(
            "eventInvitations.getByToken",
            json!({ "token": token }),
            None,
        )
        .await;
    assert_eq!(view.body["value"]["helper"], json!(true));
    assert_eq!(view.body["value"]["event"]["title"], json!("Fahrradbörse"));

    let hanna = fixtures::user(&s.db, "Hanna").await;
    let reply = s.accept(hanna, &token).await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.body);
    assert_eq!(s.roles(hanna).await, ["coorganizer", "seller"]);
    assert_eq!(s.open().await, json!([]));

    // Used up
    let again = s
        .app
        .query(
            "eventInvitations.getByToken",
            json!({ "token": token }),
            None,
        )
        .await;
    assert_eq!(again.body["value"], Value::Null);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_seller_invitation_does_not_make_a_helper(db: PgPool) {
    let s = setup(db).await;
    let token = s.invite("sina@test.example", false).await;
    let sina = fixtures::user(&s.db, "Sina").await;
    assert_eq!(s.accept(sina, &token).await.status, StatusCode::OK);
    assert_eq!(s.roles(sina).await, ["seller"]);
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_forwarded_link_does_not_work_for_another_account(db: PgPool) {
    let s = setup(db).await;
    let token = s.invite("hanna@test.example", true).await;
    let other = fixtures::user(&s.db, "Mallory").await;
    let reply = s.accept(other, &token).await;
    assert_eq!(reply.status, StatusCode::FORBIDDEN, "{}", reply.body);
    assert!(s.roles(other).await.is_empty());
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn a_revoked_or_replaced_link_stops_working(db: PgPool) {
    let s = setup(db).await;
    let hanna = fixtures::user(&s.db, "Hanna").await;
    let first = s.invite("hanna@test.example", true).await;
    let second = s.invite("hanna@test.example", false).await;
    assert_eq!(s.open().await.as_array().unwrap().len(), 1);
    assert_eq!(
        s.accept(hanna, &first).await.status,
        StatusCode::BAD_REQUEST
    );

    let id = s.open().await[0]["_id"].clone();
    s.app
        .mutation(
            "eventInvitations.revoke",
            json!({ "eventId": s.event, "invitationId": id }),
            Some(&s.organizer),
        )
        .await;
    assert_eq!(
        s.accept(hanna, &second).await.status,
        StatusCode::BAD_REQUEST
    );
    assert!(s.roles(hanna).await.is_empty());
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn only_the_organizer_invites_and_within_the_limit(db: PgPool) {
    let s = setup(db).await;
    let helper = fixtures::user(&s.db, "Helfer").await;
    fixtures::role(&s.db, s.event, helper, "coorganizer").await;
    let reply = s
        .app
        .mutation(
            "eventInvitations.send",
            json!({ "eventId": s.event, "email": "a@test.example", "helper": true }),
            Some(&fixtures::session(&s.db, helper).await),
        )
        .await;
    assert_eq!(reply.status, StatusCode::FORBIDDEN);

    assert_eq!(
        s.send("kein-mail", false).await.status,
        StatusCode::BAD_REQUEST
    );

    for _ in 0..30 {
        assert_eq!(s.send("a@test.example", false).await.status, StatusCode::OK);
    }
    assert_eq!(
        s.send("b@test.example", false).await.status,
        StatusCode::TOO_MANY_REQUESTS
    );
}

#[sqlx::test(migrator = "bazarpro_backend::MIGRATOR")]
async fn the_link_opens_a_bazaar_with_an_access_code(db: PgPool) {
    let s = setup(db).await;
    sqlx::query("UPDATE events SET access_code = 'GEHEIM', visibility = 'approved' WHERE id = $1")
        .bind(s.event)
        .execute(&s.db)
        .await
        .unwrap();
    let token = s.invite("sina@test.example", false).await;
    let sina = fixtures::user(&s.db, "Sina").await;
    assert_eq!(s.accept(sina, &token).await.status, StatusCode::OK);
    assert_eq!(s.roles(sina).await, ["seller"]);
}
