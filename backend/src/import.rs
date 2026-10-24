//! Import of a Convex export (`npx convex export --include-file-storage`) into an empty
//! database: `bazarpro-backend import <export.zip>`.
//!
//! IDs are derived from the Convex IDs (UUID v5), so references resolve without lookup
//! tables and the file keys stay the same when the import is repeated on a fresh
//! database. Convex has no foreign keys: a reference to a deleted document becomes NULL
//! where it is optional; a row whose required reference is missing is skipped. Both are
//! counted in the report.
//!
//! Not imported: sessions, refresh tokens, sign-in codes and rate limits (everybody
//! signs in once more; passwords keep working) and the E2E codes.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs::File;
use std::io::Read;

use anyhow::{Context, bail};
use chrono::{DateTime, TimeZone, Utc};
use object_store::path::Path as ObjectPath;
use object_store::{ObjectStoreExt, PutPayload};
use rust_decimal::Decimal;
use rust_decimal::prelude::FromPrimitive;
use serde_json::{Map, Value};
use sqlx::{PgConnection, Postgres, Transaction};
use uuid::Uuid;
use zip::ZipArchive;

use crate::AppState;
use crate::money::Cents;

/// Namespace of the IDs derived from Convex IDs
const NAMESPACE: Uuid = Uuid::from_u128(0x6f1e_3c55_2b8a_4d0e_9a77_b2c4_1f00_c0de);

pub fn uuid_for(legacy_id: &str) -> Uuid {
    Uuid::new_v5(&NAMESPACE, legacy_id.as_bytes())
}

/// What the import did, printed at the end.
#[derive(Debug, Default)]
pub struct Report {
    pub imported: BTreeMap<&'static str, usize>,
    /// e.g. "products.productCategory → row skipped": count
    pub problems: BTreeMap<String, usize>,
}

impl Report {
    fn count(&mut self, table: &'static str) {
        *self.imported.entry(table).or_default() += 1;
    }

    fn problem(&mut self, what: String) {
        *self.problems.entry(what).or_default() += 1;
    }
}

impl std::fmt::Display for Report {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        writeln!(f, "Importiert:")?;
        for (table, count) in &self.imported {
            writeln!(f, "  {table:28} {count}")?;
        }
        if !self.problems.is_empty() {
            writeln!(f, "Probleme (Verweise auf gelöschte Dokumente u. Ä.):")?;
            for (what, count) in &self.problems {
                writeln!(f, "  {what}: {count}")?;
            }
        }
        Ok(())
    }
}

/// One Convex document.
struct Doc<'a>(&'a Map<String, Value>);

impl Doc<'_> {
    fn legacy_id(&self) -> &str {
        self.0["_id"].as_str().unwrap_or_default()
    }

    fn id(&self) -> Uuid {
        uuid_for(self.legacy_id())
    }

    fn str(&self, key: &str) -> Option<String> {
        self.0.get(key)?.as_str().map(str::to_owned)
    }

    fn string(&self, key: &str) -> String {
        self.str(key).unwrap_or_default()
    }

    fn bool(&self, key: &str) -> Option<bool> {
        self.0.get(key)?.as_bool()
    }

    fn num(&self, key: &str) -> Option<f64> {
        self.0.get(key)?.as_f64()
    }

    fn int(&self, key: &str) -> Option<i64> {
        self.num(key).map(|value| value.round() as i64)
    }

    fn time(&self, key: &str) -> Option<DateTime<Utc>> {
        ms_to_time(self.num(key)?)
    }

    fn created(&self) -> DateTime<Utc> {
        self.time("_creationTime").unwrap_or_else(Utc::now)
    }

    /// Euros and percentages: two decimals, without float noise
    fn decimal(&self, key: &str) -> Option<Decimal> {
        Decimal::from_f64(self.num(key)?).map(|value| value.cents())
    }

    fn json(&self, key: &str) -> Option<Value> {
        self.0.get(key).cloned()
    }

    fn object(&self, key: &str) -> Option<Doc<'_>> {
        self.0.get(key)?.as_object().map(Doc)
    }

    fn ids(&self, key: &str) -> Vec<String> {
        self.0
            .get(key)
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(|item| item.as_str().map(str::to_owned))
                    .collect()
            })
            .unwrap_or_default()
    }
}

fn ms_to_time(ms: f64) -> Option<DateTime<Utc>> {
    Utc.timestamp_millis_opt(ms.round() as i64).single()
}

/// The documents of all tables in the export.
struct Export {
    tables: HashMap<String, Vec<Map<String, Value>>>,
}

impl Export {
    fn docs(&self, table: &str) -> impl Iterator<Item = Doc<'_>> {
        self.tables.get(table).into_iter().flatten().map(Doc)
    }
}

fn read_tables(archive: &mut ZipArchive<File>) -> anyhow::Result<Export> {
    let names: Vec<String> = archive
        .file_names()
        .filter_map(Result::ok)
        .map(|name| name.into_owned())
        .collect();
    let mut tables = HashMap::new();
    for name in names {
        let Some(table) = name.strip_suffix("/documents.jsonl") else {
            continue;
        };
        let mut text = String::new();
        archive.by_name(&name)?.read_to_string(&mut text)?;
        let docs = text
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(serde_json::from_str::<Map<String, Value>>)
            .collect::<Result<Vec<_>, _>>()
            .with_context(|| format!("{name} is not valid JSONL"))?;
        tables.insert(table.to_owned(), docs);
    }
    if !tables.contains_key("users") {
        bail!("no users/documents.jsonl: is this a Convex export?");
    }
    Ok(Export { tables })
}

/// Which IDs of each table exist, to check references.
#[derive(Default)]
struct Known {
    ids: HashMap<&'static str, HashSet<Uuid>>,
}

impl Known {
    fn add(&mut self, table: &'static str, id: Uuid) {
        self.ids.entry(table).or_default().insert(id);
    }

    fn has(&self, table: &'static str, id: Uuid) -> bool {
        self.ids.get(table).is_some_and(|ids| ids.contains(&id))
    }
}

/// Resolves references and records the ones that point nowhere.
struct Refs<'a> {
    known: &'a Known,
    report: &'a mut Report,
}

impl Refs<'_> {
    /// Optional reference: NULL if the target is missing.
    fn optional(
        &mut self,
        doc: &Doc,
        key: &str,
        table: &'static str,
        context: &str,
    ) -> Option<Uuid> {
        let legacy = doc.str(key)?;
        let id = uuid_for(&legacy);
        if self.known.has(table, id) {
            Some(id)
        } else {
            self.report
                .problem(format!("{context}.{key} → leer gelassen"));
            None
        }
    }

    /// Required reference: None means the row must be skipped.
    fn required(
        &mut self,
        doc: &Doc,
        key: &str,
        table: &'static str,
        context: &str,
    ) -> Option<Uuid> {
        let id = doc.str(key).map(|legacy| uuid_for(&legacy));
        match id {
            Some(id) if self.known.has(table, id) => Some(id),
            _ => {
                self.report
                    .problem(format!("{context}.{key} → Zeile übersprungen"));
                None
            }
        }
    }

    fn list(&mut self, doc: &Doc, key: &str, table: &'static str, context: &str) -> Vec<Uuid> {
        let mut ids = Vec::new();
        for legacy in doc.ids(key) {
            let id = uuid_for(&legacy);
            if self.known.has(table, id) {
                ids.push(id);
            } else {
                self.report
                    .problem(format!("{context}.{key} → Eintrag entfernt"));
            }
        }
        ids
    }
}

/// A file of `_storage` whose bytes are in the store.
struct ImportedFile {
    id: Uuid,
    legacy_id: String,
    storage_key: String,
    content_type: Option<String>,
    size: i64,
    sha256: Option<String>,
    created: DateTime<Utc>,
}

/// Uploads the files of `_storage`.
async fn import_files(
    state: &AppState,
    archive: &mut ZipArchive<File>,
    export: &Export,
    report: &mut Report,
) -> anyhow::Result<Vec<ImportedFile>> {
    // Stored as _storage/<id>.<extension>
    let entries: HashMap<String, String> = archive
        .file_names()
        .filter_map(Result::ok)
        .filter_map(|name| {
            let file = name.strip_prefix("_storage/")?;
            let stem = file.split('.').next()?;
            (stem != "documents").then(|| (stem.to_owned(), name.to_string()))
        })
        .collect();
    let mut files = Vec::new();
    for doc in export.docs("_storage") {
        let Some(entry) = entries.get(doc.legacy_id()) else {
            report.problem("_storage: Datei fehlt im Export → übersprungen".to_owned());
            continue;
        };
        let mut bytes = Vec::new();
        archive.by_name(entry)?.read_to_end(&mut bytes)?;
        let id = doc.id();
        let key = format!("files/{id}");
        let size = bytes.len() as i64;
        state
            .storage
            .put(&ObjectPath::from(key.as_str()), PutPayload::from(bytes))
            .await
            .with_context(|| format!("storing {entry}"))?;
        files.push(ImportedFile {
            id,
            legacy_id: doc.legacy_id().to_owned(),
            storage_key: key,
            content_type: doc.str("contentType"),
            size,
            sha256: doc.str("sha256"),
            created: doc.created(),
        });
    }
    Ok(files)
}

pub async fn run(state: &AppState, path: &str) -> anyhow::Result<Report> {
    let file = File::open(path).with_context(|| format!("opening {path}"))?;
    let mut archive = ZipArchive::new(file).context("not a ZIP file")?;
    let export = read_tables(&mut archive)?;

    let users: i64 = sqlx::query_scalar("SELECT count(*) FROM users")
        .fetch_one(&state.db)
        .await?;
    if users > 0 {
        bail!("the database already has users; the import only fills an empty database");
    }

    let mut report = Report::default();
    let files = import_files(state, &mut archive, &export, &mut report).await?;

    let mut tx = state.db.begin().await?;
    let mut known = Known::default();
    for file in files {
        sqlx::query(
            "INSERT INTO files (id, legacy_id, storage_key, content_type, size_bytes, sha256, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)",
        )
        .bind(file.id)
        .bind(&file.legacy_id)
        .bind(&file.storage_key)
        .bind(&file.content_type)
        .bind(file.size)
        .bind(&file.sha256)
        .bind(file.created)
        .execute(&mut *tx)
        .await?;
        known.add("files", file.id);
        report.count("files");
    }

    import_rows(&mut tx, &export, &mut known, &mut report).await?;
    // The migrations ran on the empty database, before the rows were there
    crate::modules::seller_records::backfill_snapshots(&mut tx).await?;
    tx.commit().await?;
    Ok(report)
}

async fn import_rows(
    tx: &mut Transaction<'_, Postgres>,
    export: &Export,
    known: &mut Known,
    report: &mut Report,
) -> anyhow::Result<()> {
    // Rows are inserted in the order of their references; IDs are known up front, so
    // the IDs of a table are registered before the rows that point to it.
    for (convex, table) in [
        ("users", "users"),
        ("categories", "categories"),
        ("events", "events"),
        ("eventLocationCategories", "event_location_categories"),
        ("products", "products"),
        ("eventProducts", "event_products"),
        ("productOffers", "product_offers"),
        ("reports", "reports"),
    ] {
        for doc in export.docs(convex) {
            known.add(table, doc.id());
        }
    }
    // Rows skipped below are removed again (`forget`), so their dependents are skipped too.
    users(tx, export, known, report).await?;
    categories(tx, export, known, report).await?;
    events(tx, export, known, report).await?;
    rest(tx, export, known, report).await?;
    Ok(())
}

async fn users(
    tx: &mut PgConnection,
    export: &Export,
    known: &mut Known,
    report: &mut Report,
) -> anyhow::Result<()> {
    for doc in export.docs("users") {
        sqlx::query(
            "INSERT INTO users (id, legacy_id, created_at, name, image, email, email_verified_at, phone,
               phone_verified_at, is_anonymous, first_name, last_name, street, city, zip_code, country,
               verification_token, is_mail_confirmed, status, last_login_at, system_role,
               needs_onboarding, check_in_token, check_in_token_expires_at, contact_email,
               notification_prefs, unsubscribe_token, locale)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
               $19::user_status, $20, $21::system_role, $22, $23, $24, $25, $26,
               COALESCE($27, replace(gen_random_uuid()::text, '-', '')), $28::locale)",
        )
        .bind(doc.id())
        .bind(doc.legacy_id())
        .bind(doc.created())
        .bind(doc.str("name"))
        .bind(doc.str("image"))
        .bind(doc.str("email"))
        .bind(doc.time("emailVerificationTime"))
        .bind(doc.str("phone"))
        .bind(doc.time("phoneVerificationTime"))
        .bind(doc.bool("isAnonymous"))
        .bind(doc.str("firstName"))
        .bind(doc.str("lastName"))
        .bind(doc.str("street"))
        .bind(doc.str("city"))
        .bind(doc.str("zipCode"))
        .bind(doc.str("country"))
        .bind(doc.str("verificationToken"))
        .bind(doc.bool("isMailConfirmed"))
        .bind(doc.str("status"))
        .bind(doc.time("lastLoginAt"))
        .bind(doc.str("systemRole"))
        .bind(doc.bool("needsOnboarding"))
        .bind(doc.str("checkInToken"))
        .bind(doc.time("checkInTokenExpires"))
        .bind(doc.str("contactEmail"))
        .bind(doc.json("notificationPrefs").unwrap_or_else(|| Value::Object(Map::new())))
        .bind(doc.str("unsubscribeToken"))
        .bind(doc.str("locale"))
        .execute(&mut *tx)
        .await?;
        report.count("users");
    }

    let mut refs = Refs { known, report };
    let mut accounts = Vec::new();
    for doc in export.docs("authAccounts") {
        let Some(user) = refs.required(&doc, "userId", "users", "authAccounts") else {
            continue;
        };
        accounts.push((
            doc.id(),
            doc.legacy_id().to_owned(),
            user,
            doc.created(),
            doc.0.clone(),
        ));
    }
    for (id, legacy, user, created, raw) in accounts {
        let doc = Doc(&raw);
        let inserted = sqlx::query(
            "INSERT INTO auth_accounts (id, legacy_id, user_id, provider, provider_account_id, secret,
               email_verified, phone_verified, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (provider, provider_account_id) DO NOTHING",
        )
        .bind(id)
        .bind(legacy)
        .bind(user)
        .bind(doc.string("provider"))
        .bind(doc.string("providerAccountId"))
        .bind(doc.str("secret"))
        .bind(doc.str("emailVerified"))
        .bind(doc.str("phoneVerified"))
        .bind(created)
        .execute(&mut *tx)
        .await?;
        if inserted.rows_affected() == 1 {
            report.count("auth_accounts");
        } else {
            report.problem("authAccounts: doppeltes Konto → übersprungen".to_owned());
        }
    }
    Ok(())
}

async fn categories(
    tx: &mut PgConnection,
    export: &Export,
    known: &mut Known,
    report: &mut Report,
) -> anyhow::Result<()> {
    for doc in export.docs("categories") {
        sqlx::query(
            "INSERT INTO categories (id, legacy_id, label, updated_at, created_at)
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(doc.id())
        .bind(doc.legacy_id())
        .bind(doc.string("label"))
        .bind(doc.time("updatedAt").unwrap_or_else(|| doc.created()))
        .bind(doc.created())
        .execute(&mut *tx)
        .await?;
        report.count("categories");
    }
    let mut refs = Refs { known, report };
    for doc in export.docs("categories") {
        if let Some(parent) = refs.optional(&doc, "parentCategory", "categories", "categories") {
            sqlx::query("UPDATE categories SET parent_id = $2 WHERE id = $1")
                .bind(doc.id())
                .bind(parent)
                .execute(&mut *tx)
                .await?;
        }
    }
    Ok(())
}

fn moderation(doc: &Doc) -> (Option<DateTime<Utc>>, Option<Uuid>, Option<String>) {
    match doc.object("moderation") {
        Some(moderation) => (
            moderation.time("hiddenAt"),
            moderation.str("hiddenBy").map(|id| uuid_for(&id)),
            moderation.str("reason"),
        ),
        None => (None, None, None),
    }
}

/// Moderation needs all three fields and an existing admin, else it is dropped.
fn checked_moderation(
    refs: &mut Refs,
    doc: &Doc,
    context: &str,
) -> (Option<DateTime<Utc>>, Option<Uuid>, Option<String>) {
    match moderation(doc) {
        (Some(at), Some(by), Some(reason)) if refs.known.has("users", by) => {
            (Some(at), Some(by), Some(reason))
        }
        (None, None, None) => (None, None, None),
        _ => {
            refs.report
                .problem(format!("{context}.moderation unvollständig → entfernt"));
            (None, None, None)
        }
    }
}

async fn events(
    tx: &mut PgConnection,
    export: &Export,
    known: &mut Known,
    report: &mut Report,
) -> anyhow::Result<()> {
    let mut skipped = Vec::new();
    {
        let mut refs = Refs { known, report };
        for doc in export.docs("events") {
            let Some(organizer) = refs.required(&doc, "organizerId", "users", "events") else {
                skipped.push(doc.id());
                continue;
            };
            let logistics = doc.object("sellerLogistics");
            let reminders = doc.object("remindersSent");
            let (hidden_at, hidden_by, hidden_reason) =
                checked_moderation(&mut refs, &doc, "events");
            let services: Vec<String> = doc.ids("services");
            sqlx::query(
                "INSERT INTO events (id, legacy_id, created_at, title, description, cover_image_id,
                   map_image_id, location, start_date, end_date, contact_info, services, visibility,
                   is_approved, approval_status, approved_at, approved_by, rejected_at, rejected_by,
                   rejection_reason, access_code, vendor_limit, last_seller_number, commission,
                   sale_fee_fixed, sale_fee_percentage, features, dropoff_start, dropoff_end,
                   pickup_start, pickup_end, logistics_note, reminder_day_before_sent_for,
                   reminder_pickup_sent_for, hidden_at, hidden_by, hidden_reason, organizer_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::event_service[],
                   $13::event_visibility, $14, $15::approval_status, $16, $17, $18, $19, $20, $21, $22,
                   $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38)",
            )
            .bind(doc.id())
            .bind(doc.legacy_id())
            .bind(doc.created())
            .bind(doc.string("title"))
            .bind(doc.string("description"))
            .bind(refs.optional(&doc, "coverImage", "files", "events"))
            .bind(refs.optional(&doc, "eventMapImage", "files", "events"))
            .bind(doc.string("location"))
            .bind(doc.time("startDate"))
            .bind(doc.time("endDate"))
            .bind(doc.string("contactInfo"))
            .bind(services)
            .bind(doc.str("visibility").unwrap_or_else(|| "public".to_owned()))
            .bind(doc.bool("isApproved"))
            .bind(doc.str("approvalStatus"))
            .bind(doc.time("approvedAt"))
            .bind(refs.optional(&doc, "approvedBy", "users", "events"))
            .bind(doc.time("rejectedAt"))
            .bind(refs.optional(&doc, "rejectedBy", "users", "events"))
            .bind(doc.str("rejectionReason"))
            .bind(doc.str("accessCode"))
            .bind(doc.int("vendorLimit").map(|value| value as i32))
            .bind(doc.int("lastSellerNumber").map(|value| value as i32))
            .bind(doc.decimal("commission").unwrap_or_default())
            .bind(doc.decimal("saleFeeFixed"))
            .bind(doc.decimal("saleFeePercentage"))
            .bind(doc.json("features").unwrap_or_else(|| Value::Object(Map::new())))
            .bind(logistics.as_ref().and_then(|l| l.time("dropoffStart")))
            .bind(logistics.as_ref().and_then(|l| l.time("dropoffEnd")))
            .bind(logistics.as_ref().and_then(|l| l.time("pickupStart")))
            .bind(logistics.as_ref().and_then(|l| l.time("pickupEnd")))
            .bind(logistics.as_ref().and_then(|l| l.str("note")))
            .bind(reminders.as_ref().and_then(|r| r.time("dayBefore")))
            .bind(reminders.as_ref().and_then(|r| r.time("pickup")))
            .bind(hidden_at)
            .bind(hidden_by)
            .bind(hidden_reason)
            .bind(organizer)
            .execute(&mut *tx)
            .await?;
            refs.report.count("events");

            for (position, category) in refs
                .list(&doc, "categories", "categories", "events")
                .into_iter()
                .enumerate()
            {
                sqlx::query(
                    "INSERT INTO event_categories (event_id, position, category_id) VALUES ($1, $2, $3)
                     ON CONFLICT DO NOTHING",
                )
                .bind(doc.id())
                .bind(position as i16)
                .bind(category)
                .execute(&mut *tx)
                .await?;
            }
        }
    }
    forget(known, "events", skipped);

    // Walk-in sellers point to their event; set after the events exist
    let mut refs = Refs { known, report };
    for doc in export.docs("users") {
        if let Some(event) = refs.optional(&doc, "managedByEventId", "events", "users") {
            sqlx::query("UPDATE users SET managed_by_event_id = $2 WHERE id = $1")
                .bind(doc.id())
                .bind(event)
                .execute(&mut *tx)
                .await?;
        }
    }
    Ok(())
}

fn forget(known: &mut Known, table: &'static str, ids: Vec<Uuid>) {
    if let Some(set) = known.ids.get_mut(table) {
        for id in ids {
            set.remove(&id);
        }
    }
}

/// Inserts and counts; a conflict (duplicate in Convex) is reported, not fatal.
async fn insert(
    query: sqlx::query::Query<'_, Postgres, sqlx::postgres::PgArguments>,
    tx: &mut PgConnection,
    report: &mut Report,
    table: &'static str,
) -> anyhow::Result<bool> {
    let inserted = query.execute(&mut *tx).await?.rows_affected() == 1;
    if inserted {
        report.count(table);
    } else {
        report.problem(format!("{table}: doppelt → übersprungen"));
    }
    Ok(inserted)
}

async fn rest(
    tx: &mut PgConnection,
    export: &Export,
    known: &mut Known,
    report: &mut Report,
) -> anyhow::Result<()> {
    // Location categories
    let mut skipped = Vec::new();
    {
        let mut refs = Refs {
            known: &*known,
            report: &mut *report,
        };
        let mut rows = Vec::new();
        for doc in export.docs("eventLocationCategories") {
            match refs.required(&doc, "eventId", "events", "eventLocationCategories") {
                Some(event) => rows.push((
                    doc.id(),
                    doc.legacy_id().to_owned(),
                    event,
                    doc.string("label"),
                    doc.created(),
                )),
                None => skipped.push(doc.id()),
            }
        }
        for (id, legacy, event, label, created) in rows {
            let query = sqlx::query(
                "INSERT INTO event_location_categories (id, legacy_id, event_id, label, created_at)
                 VALUES ($1, $2, $3, $4, $5)",
            )
            .bind(id)
            .bind(legacy)
            .bind(event)
            .bind(label)
            .bind(created);
            insert(query, tx, refs.report, "event_location_categories").await?;
        }
    }
    forget(known, "event_location_categories", skipped);

    // Products and their images
    let mut skipped = Vec::new();
    {
        let mut refs = Refs {
            known: &*known,
            report: &mut *report,
        };
        for doc in export.docs("products") {
            let vendor = refs.required(&doc, "vendorId", "users", "products");
            let category = refs.required(&doc, "productCategory", "categories", "products");
            let (Some(vendor), Some(category)) = (vendor, category) else {
                skipped.push(doc.id());
                continue;
            };
            let (hidden_at, hidden_by, hidden_reason) =
                checked_moderation(&mut refs, &doc, "products");
            let images = refs.list(&doc, "images", "files", "products");
            let query = sqlx::query(
                "INSERT INTO products (id, legacy_id, created_at, title, vendor_id, description, condition,
                   category_id, updated_at, archived_at, price, ready_for_sale, sold, attributes,
                   accepts_offers, minimum_price, hidden_at, hidden_by, hidden_reason)
                 VALUES ($1, $2, $3, $4, $5, $6, $7::product_condition, $8, $9, $10, $11, $12, $13, $14,
                   $15, $16, $17, $18, $19)",
            )
            .bind(doc.id())
            .bind(doc.legacy_id().to_owned())
            .bind(doc.created())
            .bind(doc.string("title"))
            .bind(vendor)
            .bind(doc.string("description"))
            .bind(doc.str("condition").unwrap_or_else(|| "good".to_owned()))
            .bind(category)
            .bind(doc.time("updatedAt").unwrap_or_else(|| doc.created()))
            .bind(doc.time("archivedAt"))
            .bind(doc.decimal("price").unwrap_or_default())
            .bind(doc.bool("readyForSale").unwrap_or(false))
            .bind(doc.bool("sold").unwrap_or(false))
            .bind(doc.json("attributes").unwrap_or_else(|| Value::Object(Map::new())))
            .bind(doc.bool("acceptsOffers"))
            .bind(doc.decimal("minimumPrice"))
            .bind(hidden_at)
            .bind(hidden_by)
            .bind(hidden_reason);
            insert(query, tx, refs.report, "products").await?;
            for (position, file) in images.into_iter().enumerate() {
                sqlx::query("INSERT INTO product_images (product_id, position, file_id) VALUES ($1, $2, $3)")
                    .bind(doc.id())
                    .bind(position as i16)
                    .bind(file)
                    .execute(&mut *tx)
                    .await?;
                refs.report.count("product_images");
            }
        }
    }
    forget(known, "products", skipped);

    // Products in events
    let mut skipped = Vec::new();
    {
        let mut refs = Refs {
            known: &*known,
            report: &mut *report,
        };
        for doc in export.docs("eventProducts") {
            let event = refs.required(&doc, "eventId", "events", "eventProducts");
            let product = refs.required(&doc, "productId", "products", "eventProducts");
            let (Some(event), Some(product)) = (event, product) else {
                skipped.push(doc.id());
                continue;
            };
            let query = sqlx::query(
                "INSERT INTO event_products (id, legacy_id, created_at, event_id, product_id, status,
                   discount_percent, location_category_id, internal_note)
                 VALUES ($1, $2, $3, $4, $5, $6::event_product_status, $7, $8, $9)
                 ON CONFLICT DO NOTHING",
            )
            .bind(doc.id())
            .bind(doc.legacy_id().to_owned())
            .bind(doc.created())
            .bind(event)
            .bind(product)
            .bind(doc.str("status").unwrap_or_else(|| "announced".to_owned()))
            .bind(doc.decimal("discountPercent"))
            .bind(refs.optional(&doc, "locationCategoryId", "event_location_categories", "eventProducts"))
            .bind(doc.str("internalNote"));
            if !insert(query, tx, refs.report, "event_products").await? {
                skipped.push(doc.id());
            }
        }
    }
    forget(known, "event_products", skipped);

    // Roles and sellers
    {
        let mut refs = Refs {
            known: &*known,
            report: &mut *report,
        };
        for doc in export.docs("eventRole") {
            let event = refs.required(&doc, "event", "events", "eventRole");
            let user = refs.required(&doc, "user", "users", "eventRole");
            let (Some(event), Some(user)) = (event, user) else {
                continue;
            };
            let query = sqlx::query(
                "INSERT INTO event_roles (id, legacy_id, event_id, user_id, role, created_at)
                 VALUES ($1, $2, $3, $4, $5::event_role_kind, $6) ON CONFLICT DO NOTHING",
            )
            .bind(doc.id())
            .bind(doc.legacy_id().to_owned())
            .bind(event)
            .bind(user)
            .bind(doc.string("roles"))
            .bind(doc.created());
            insert(query, tx, refs.report, "event_roles").await?;
        }

        for doc in export.docs("eventSeller") {
            let event = refs.required(&doc, "event", "events", "eventSeller");
            let user = refs.required(&doc, "user", "users", "eventSeller");
            let (Some(event), Some(user)) = (event, user) else {
                continue;
            };
            let query = sqlx::query(
                "INSERT INTO event_sellers (id, legacy_id, created_at, event_id, user_id, total_fee,
                   commission_fee, sale_fee_fixed, sale_fee_percentage, payout_amount, payout_received,
                   number, intake_fee, intake_fee_items, private_seller_confirmed_at, seller_snapshot)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                 ON CONFLICT DO NOTHING",
            )
            .bind(doc.id())
            .bind(doc.legacy_id().to_owned())
            .bind(doc.created())
            .bind(event)
            .bind(user)
            .bind(doc.decimal("totalFee").unwrap_or_default())
            .bind(doc.decimal("comissionFee").unwrap_or_default())
            .bind(doc.decimal("saleFeeFixed"))
            .bind(doc.decimal("saleFeePercentage"))
            .bind(doc.decimal("numberpayoutAmount").unwrap_or_default())
            .bind(doc.bool("payoutReceived").unwrap_or(false))
            .bind(doc.int("number").map(|value| value as i32))
            .bind(doc.decimal("intakeFee"))
            .bind(doc.int("intakeFeeItems").map(|value| value as i32))
            .bind(doc.time("privateSellerConfirmedAt"))
            // Kept in the Convex shape (takenAt in ms)
            .bind(doc.json("sellerSnapshot"));
            insert(query, tx, refs.report, "event_sellers").await?;
        }

        // Broadcasts
        for doc in export.docs("eventBroadcasts") {
            let event = refs.required(&doc, "eventId", "events", "eventBroadcasts");
            let sender = refs.required(&doc, "senderId", "users", "eventBroadcasts");
            let (Some(event), Some(sender)) = (event, sender) else {
                continue;
            };
            let query = sqlx::query(
                "INSERT INTO event_broadcasts (id, legacy_id, event_id, sender_id, subject, body, audience,
                   important, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7::broadcast_audience, $8, $9)",
            )
            .bind(doc.id())
            .bind(doc.legacy_id().to_owned())
            .bind(event)
            .bind(sender)
            .bind(doc.string("subject"))
            .bind(doc.string("body"))
            .bind(doc.str("audience").unwrap_or_else(|| "all".to_owned()))
            .bind(doc.bool("important").unwrap_or(false))
            .bind(doc.time("createdAt").unwrap_or_else(|| doc.created()));
            if !insert(query, tx, refs.report, "event_broadcasts").await? {
                continue;
            }
            for user in refs.list(&doc, "recipientIds", "users", "eventBroadcasts") {
                sqlx::query(
                    "INSERT INTO event_broadcast_recipients (broadcast_id, user_id) VALUES ($1, $2)
                     ON CONFLICT DO NOTHING",
                )
                .bind(doc.id())
                .bind(user)
                .execute(&mut *tx)
                .await?;
                refs.report.count("event_broadcast_recipients");
            }
        }
    }

    // Offers, before purchases that point to them
    let mut skipped = Vec::new();
    {
        let mut refs = Refs {
            known: &*known,
            report: &mut *report,
        };
        for doc in export.docs("productOffers") {
            let event = refs.required(&doc, "eventId", "events", "productOffers");
            let product = refs.required(&doc, "productId", "products", "productOffers");
            let event_product =
                refs.required(&doc, "eventProductId", "event_products", "productOffers");
            let buyer = refs.required(&doc, "buyerId", "users", "productOffers");
            let (Some(event), Some(product), Some(event_product), Some(buyer)) =
                (event, product, event_product, buyer)
            else {
                skipped.push(doc.id());
                continue;
            };
            let query = sqlx::query(
                "INSERT INTO product_offers (id, legacy_id, event_id, product_id, event_product_id, buyer_id,
                   amount, message, status, created_at, responded_at, closed_by, closed_from_status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::offer_status, $10, $11,
                   $12::offer_close_reason, $13::offer_status)",
            )
            .bind(doc.id())
            .bind(doc.legacy_id().to_owned())
            .bind(event)
            .bind(product)
            .bind(event_product)
            .bind(buyer)
            .bind(doc.decimal("amount").unwrap_or_default())
            .bind(doc.str("message"))
            .bind(doc.str("status").unwrap_or_else(|| "pending".to_owned()))
            .bind(doc.time("createdAt").unwrap_or_else(|| doc.created()))
            .bind(doc.time("respondedAt"))
            .bind(doc.str("closedBy"))
            .bind(doc.str("closedFromStatus"));
            insert(query, tx, refs.report, "product_offers").await?;
        }
    }
    forget(known, "product_offers", skipped);

    let mut skipped_reports = Vec::new();
    {
        let mut refs = Refs {
            known: &*known,
            report: &mut *report,
        };
        for doc in export.docs("purchase") {
            let product = refs.required(&doc, "product", "products", "purchase");
            let event = refs.required(&doc, "event", "events", "purchase");
            let seller = refs.required(&doc, "seller", "users", "purchase");
            let (Some(product), Some(event), Some(seller)) = (product, event, seller) else {
                continue;
            };
            let query = sqlx::query(
                "INSERT INTO purchases (id, legacy_id, created_at, product_id, event_id, seller_id,
                   total_amount, commission_amount, payout_amount, payout_status, payout_date,
                   discount_percent, list_price, price_source, offer_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                   $14::purchase_price_source, $15)",
            )
            .bind(doc.id())
            .bind(doc.legacy_id().to_owned())
            .bind(doc.created())
            .bind(product)
            .bind(event)
            .bind(seller)
            .bind(doc.decimal("totalAmount").unwrap_or_default())
            .bind(doc.decimal("comissionAmount").unwrap_or_default())
            .bind(doc.decimal("payoutAmount").unwrap_or_default())
            .bind(doc.bool("payoutStatus").unwrap_or(false))
            .bind(doc.time("payoutDate").unwrap_or_else(|| doc.created()))
            .bind(doc.decimal("discountPercent"))
            .bind(doc.decimal("listPrice"))
            .bind(doc.str("priceSource"))
            .bind(refs.optional(&doc, "offerId", "product_offers", "purchase"));
            insert(query, tx, refs.report, "purchases").await?;
        }

        for doc in export.docs("productQuestions") {
            let event = refs.required(&doc, "eventId", "events", "productQuestions");
            let product = refs.required(&doc, "productId", "products", "productQuestions");
            let asker = refs.required(&doc, "askerId", "users", "productQuestions");
            let (Some(event), Some(product), Some(asker)) = (event, product, asker) else {
                continue;
            };
            let query = sqlx::query(
                "INSERT INTO product_questions (id, legacy_id, event_id, product_id, asker_id, question,
                   answer, answered_by, created_at, answered_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
            )
            .bind(doc.id())
            .bind(doc.legacy_id().to_owned())
            .bind(event)
            .bind(product)
            .bind(asker)
            .bind(doc.string("question"))
            .bind(doc.str("answer"))
            .bind(refs.optional(&doc, "answeredBy", "users", "productQuestions"))
            .bind(doc.time("createdAt").unwrap_or_else(|| doc.created()))
            .bind(doc.time("answeredAt"));
            insert(query, tx, refs.report, "product_questions").await?;
        }

        for doc in export.docs("unreadNotices") {
            let Some(user) = refs.required(&doc, "userId", "users", "unreadNotices") else {
                continue;
            };
            let query = sqlx::query(
                "INSERT INTO unread_notices (user_id, area, event_id, created_at)
                 VALUES ($1, $2::notice_area, $3, $4)",
            )
            .bind(user)
            .bind(doc.string("area"))
            .bind(refs.optional(&doc, "eventId", "events", "unreadNotices"))
            .bind(doc.time("createdAt").unwrap_or_else(|| doc.created()));
            insert(query, tx, refs.report, "unread_notices").await?;
        }

        for doc in export.docs("featureFlags") {
            let query = sqlx::query(
                "INSERT INTO feature_flags (key, value, description, created_at) VALUES ($1, $2, $3, $4)
                 ON CONFLICT DO NOTHING",
            )
            .bind(doc.string("key"))
            .bind(doc.bool("value").unwrap_or(false))
            .bind(doc.str("description"))
            .bind(doc.created());
            insert(query, tx, refs.report, "feature_flags").await?;
        }

        for doc in export.docs("messages") {
            let query = sqlx::query(
                "INSERT INTO contact_messages (id, legacy_id, name, email, message, accepted_privacy_policy,
                   created_at, handled_at, handled_by)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
            )
            .bind(doc.id())
            .bind(doc.legacy_id().to_owned())
            .bind(doc.string("name"))
            .bind(doc.string("email"))
            .bind(doc.string("message"))
            .bind(doc.bool("acceptedPrivacyPolicy").unwrap_or(false))
            .bind(doc.time("createdAt").unwrap_or_else(|| doc.created()))
            .bind(doc.time("handledAt"))
            .bind(refs.optional(&doc, "handledBy", "users", "messages"));
            insert(query, tx, refs.report, "contact_messages").await?;
        }

        for doc in export.docs("reports") {
            // The target may be of any table; its ID derives from the Convex ID like all
            let target = doc.str("targetId").map(|id| uuid_for(&id));
            let Some(target) = target else {
                skipped_reports.push(doc.id());
                continue;
            };
            let query = sqlx::query(
                "INSERT INTO reports (id, legacy_id, target_type, target_id, reason, details, reporter_id,
                   reporter_email, status, created_at, resolved_at, resolved_by, resolution_note)
                 VALUES ($1, $2, $3::report_target, $4, $5::report_reason, $6, $7, $8, $9::report_status,
                   $10, $11, $12, $13)",
            )
            .bind(doc.id())
            .bind(doc.legacy_id().to_owned())
            .bind(doc.string("targetType"))
            .bind(target)
            .bind(doc.string("reason"))
            .bind(doc.string("details"))
            .bind(refs.optional(&doc, "reporterId", "users", "reports"))
            .bind(doc.str("reporterEmail"))
            .bind(doc.str("status").unwrap_or_else(|| "open".to_owned()))
            .bind(doc.time("createdAt").unwrap_or_else(|| doc.created()))
            .bind(doc.time("resolvedAt"))
            .bind(refs.optional(&doc, "resolvedBy", "users", "reports"))
            .bind(doc.str("resolutionNote"));
            insert(query, tx, refs.report, "reports").await?;
        }
    }
    forget(known, "reports", skipped_reports);

    let mut refs = Refs {
        known: &*known,
        report: &mut *report,
    };
    for doc in export.docs("moderationLog") {
        let Some(admin) = refs.required(&doc, "adminId", "users", "moderationLog") else {
            continue;
        };
        let Some(target) = doc.str("targetId").map(|id| uuid_for(&id)) else {
            continue;
        };
        let query = sqlx::query(
            "INSERT INTO moderation_log (id, legacy_id, admin_id, action, target_type, target_id,
               target_label, reason, report_id, created_at)
             VALUES ($1, $2, $3, $4::moderation_action, $5::report_target, $6, $7, $8, $9, $10)",
        )
        .bind(doc.id())
        .bind(doc.legacy_id().to_owned())
        .bind(admin)
        .bind(doc.string("action"))
        .bind(doc.string("targetType"))
        .bind(target)
        .bind(doc.string("targetLabel"))
        .bind(doc.str("reason"))
        .bind(refs.optional(&doc, "reportId", "reports", "moderationLog"))
        .bind(doc.time("createdAt").unwrap_or_else(|| doc.created()));
        insert(query, tx, refs.report, "moderation_log").await?;
    }

    for doc in export.docs("sitePages") {
        let Some(by) = refs.required(&doc, "updatedBy", "users", "sitePages") else {
            continue;
        };
        let query = sqlx::query(
            "INSERT INTO site_pages (slug, title, markdown, version, updated_at, updated_by, created_at)
             VALUES ($1::site_page_slug, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING",
        )
        .bind(doc.string("slug"))
        .bind(doc.string("title"))
        .bind(doc.string("markdown"))
        .bind(doc.int("version").unwrap_or(1) as i32)
        .bind(doc.time("updatedAt").unwrap_or_else(|| doc.created()))
        .bind(by)
        .bind(doc.created());
        insert(query, tx, refs.report, "site_pages").await?;
    }

    for doc in export.docs("sitePageVersions") {
        let Some(by) = refs.required(&doc, "createdBy", "users", "sitePageVersions") else {
            continue;
        };
        let query = sqlx::query(
            "INSERT INTO site_page_versions (slug, version, title, markdown, created_at, created_by)
             VALUES ($1::site_page_slug, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING",
        )
        .bind(doc.string("slug"))
        .bind(doc.int("version").unwrap_or(1) as i32)
        .bind(doc.string("title"))
        .bind(doc.string("markdown"))
        .bind(doc.time("createdAt").unwrap_or_else(|| doc.created()))
        .bind(by);
        insert(query, tx, refs.report, "site_page_versions").await?;
    }

    // At most one row each; the first wins
    if let Some(doc) = export.docs("siteSettings").next()
        && let Some(by) = refs.required(&doc, "updatedBy", "users", "siteSettings")
    {
        let query = sqlx::query(
            "INSERT INTO site_settings (name, contact_email, logo_id, plausible_enabled, plausible_domain,
               plausible_api_host, start_page, updated_at, updated_by, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7::start_page, $8, $9, $10)",
        )
        .bind(doc.str("name"))
        .bind(doc.str("contactEmail"))
        .bind(refs.optional(&doc, "logo", "files", "siteSettings"))
        .bind(doc.bool("plausibleEnabled"))
        .bind(doc.str("plausibleDomain"))
        .bind(doc.str("plausibleApiHost"))
        .bind(doc.str("startPage"))
        .bind(doc.time("updatedAt").unwrap_or_else(|| doc.created()))
        .bind(by)
        .bind(doc.created());
        insert(query, tx, refs.report, "site_settings").await?;
    }
    if let Some(doc) = export.docs("platformStats").next() {
        let query = sqlx::query(
            // The hourly cron may have written the row before the import, from the empty database
            "INSERT INTO platform_stats (users, products, updated_at, created_at) VALUES ($1, $2, $3, $4)
             ON CONFLICT (singleton) DO UPDATE SET users = EXCLUDED.users,
               products = EXCLUDED.products, updated_at = EXCLUDED.updated_at",
        )
        .bind(doc.int("users").unwrap_or(0))
        .bind(doc.int("products").unwrap_or(0))
        .bind(doc.time("updatedAt").unwrap_or_else(|| doc.created()))
        .bind(doc.created());
        insert(query, tx, refs.report, "platform_stats").await?;
    }
    Ok(())
}
