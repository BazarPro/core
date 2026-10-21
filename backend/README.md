# BazarPro Backend (Rust)

Axum + Postgres, ohne Zustand im Prozess, sodass beliebig viele Instanzen hinter Traefik
laufen können. Hat Convex abgelöst; die Tabelle zeigt, was woraus wurde.

| Convex                    | Hier                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| Datenbank, Schema         | Postgres, `migrations/` (läuft beim Start, Advisory Lock gegen parallele Instanzen)                |
| Reaktive `useQuery`       | `src/realtime.rs`: `touch(tx, topics)` → `pg_notify` beim Commit → WebSocket `/api/ws`             |
| `ctx.scheduler`           | `src/jobs.rs`: `enqueue`/`cancel` in der Transaktion der Mutation                                  |
| `convex/crons.ts`         | `jobs::CRONS`, je Slot genau einmal über alle Instanzen                                            |
| `@convex-dev/auth`        | `src/auth/`: Passwort + E-Mail-Code, Google, GitHub; Session im HttpOnly-Cookie                    |
| `_storage`, `ctx.storage` | `src/storage.rs`: Verzeichnis oder S3-Bucket, Tabelle `files`, Fremdschlüssel statt verwaister IDs |
| `convex/mail.ts`          | `src/mail.rs`: SMTP (lettre) aus einem Job, Texte aus `src/locales/*/mail.json`                    |

Alle Routen außer `/healthz` liegen unter `/api`; Traefik/der Node-Server leitet `/api` auf
dieselbe Domain wie die App weiter, damit das Session-Cookie First-Party bleibt.

## Anmeldung

| Route                                                  |                                                                                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/password`                              | Body wie `signIn('password', …)`: `flow` = `signUp`, `signIn`, `email-verification`, `reset`, `reset-verification`; Antwort `{"signingIn": bool}` |
| `POST /api/auth/signout`                               |                                                                                                                                                   |
| `GET /api/auth/session`                                | `{"userId": … \| null}`                                                                                                                           |
| `GET /api/auth/providers`                              | `{"google": bool, "github": bool}`                                                                                                                |
| `GET /api/auth/oauth/{google,github}?redirectTo=/pfad` | Weiterleitung zum Anbieter; Rückkehr über `…/callback`, Fehler nach `/login?error=CODE`                                                           |
| `GET /api/auth/e2e-code?email=`                        | nur mit Flag `is_e2e_auth_skip_email`                                                                                                             |

Fehler: `{"code", "params", "message"}`. Codes aus `errors.json` (z. B. `auth.required`) oder
die bisherigen Anmelde-Codes (`ACCOUNT_BANNED`, `ACCOUNT_DELETED`, `INVALID_CREDENTIALS`,
`INVALID_CODE`, `INVALID_PASSWORD`, `ACCOUNT_ALREADY_EXISTS`, `LOGIN_DISABLED`,
`REGISTRATION_DISABLED`, `TOO_MANY_FAILED_ATTEMPTS`, `EMAIL_NOT_VERIFIED`).

Aus Convex importierte Passwörter (Lucia-scrypt) funktionieren weiter und werden bei der
nächsten Anmeldung auf Argon2id umgestellt.

## Dateien

| Route                 |                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/files`     | Rohdaten des Bilds, nur angemeldet; Antwort `{"storageId"}` wie die Convex-Upload-URL. Nur JPEG/PNG/WebP (am Inhalt erkannt), max. 10 MB |
| `GET /api/files/{id}` | dauerhaft cachebar (`immutable`), mit `nosniff` und Sandbox-CSP                                                                          |

Der Cron `cleanup orphaned uploads` löscht täglich Dateien, die nichts mehr referenziert und
die älter als ein Tag sind.

## Import aus Convex

```sh
npx convex export --include-file-storage --path export.zip
DATABASE_URL=… S3_BUCKET=…/STORAGE_DIR=… bazarpro-backend import export.zip
```

Nur in eine leere Datenbank. Die IDs werden aus den Convex-IDs abgeleitet (UUID v5,
`import::uuid_for`), die alte ID steht in `legacy_id`. Verweise auf gelöschte Dokumente
werden leer gelassen bzw. die Zeile übersprungen; der Bericht am Ende zählt beides.
Sitzungen werden nicht übernommen, alle melden sich einmal neu an.

## Befehle

```sh
bazarpro-backend                                   # Server (migriert beim Start)
bazarpro-backend admin <email>                     # bestehendes Konto wird Administrator
bazarpro-backend seed [--force] [--locale en] [--no-images]   # Demo-Daten, s. src/demo
bazarpro-backend run <modul.funktion> '<json>'     # Funktion aufrufen, auch interne
bazarpro-backend import <export.zip>               # Convex-Export einspielen
```

`seed` legt die Konten der E2E-Tests an (Passwort `123456`) und spielt darum Basare in
allen Zuständen mit den echten Funktionen durch; mit `--locale en` alles auf Englisch, etwa
für Screenshots der Doku. Läuft er erneut, verschiebt er nur die laufenden Demo-Basare auf
heute (Review-Apps).

## Entwicklung

```sh
docker compose -f backend/docker-compose.dev.yml up -d postgres
export DATABASE_URL=postgres://bazarpro:bazarpro@127.0.0.1:55432/bazarpro
cd backend
cargo run      # http://127.0.0.1:3000/healthz
cargo test     # jeder Test bekommt eine eigene Datenbank
cargo deny check   # Sicherheitslücken, Lizenzen, Quellen der Crates (cargo install cargo-deny)
```

## Umgebungsvariablen

| Variable                                                                                                                      | Standard                                  |                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                                                                | –                                         | Pflicht                                                                                            |
| `LISTEN_ADDR`                                                                                                                 | `0.0.0.0:3000`                            |                                                                                                    |
| `DATABASE_MAX_CONNECTIONS`                                                                                                    | `10`                                      | pro Instanz                                                                                        |
| `RUN_WORKERS`                                                                                                                 | `true`                                    | `false`: Instanz führt keine Jobs/Crons aus                                                        |
| `RUST_LOG`                                                                                                                    | `info,sqlx=warn`                          |                                                                                                    |
| `SITE_URL`                                                                                                                    | `http://localhost:5173`                   | Links in Mails, OAuth-Callback, `Secure`-Cookies bei https                                         |
| `APP_ORIGINS`                                                                                                                 | `capacitor://localhost,https://localhost` | Origins der Mobile App (CORS, Bearer-Token)                                                        |
| `BAZARPRO_MODE`                                                                                                               | `platform`                                | `single`: selbst gehosteter Verein                                                                 |
| `ADMIN_EMAIL`                                                                                                                 | –                                         | wird nach bestätigter Adresse Admin                                                                |
| `AUTH_SMTP_HOST`, `_PORT` (587), `_USER`, `_PASS`, `_SECURE` (false), `_STARTTLS` (true), `_EHLO_HOST`, `_TIMEOUT_MS` (30000) | –                                         | ohne Host werden Mails nur geloggt                                                                 |
| `AUTH_EMAIL_FROM`                                                                                                             | `BazarPro <noreply@localhost>`            | auch base64-kodiert möglich                                                                        |
| `STORAGE_DIR`                                                                                                                 | `/data/files`                             | Dateien ohne S3 (Volume im Image)                                                                  |
| `S3_BUCKET`, `S3_ENDPOINT`, `S3_REGION` (`garage`), `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`                                | –                                         | mit `S3_BUCKET` liegen die Dateien im Bucket, z. B. Garage/SeaweedFS; nötig bei mehreren Instanzen |
| `AUTH_GOOGLE_ID`/`_SECRET`, `AUTH_GITHUB_ID`/`_SECRET`                                                                        | –                                         | Callback-URL beim Anbieter: `SITE_URL/api/auth/oauth/<provider>/callback`                          |

## WebSocket-Protokoll

`/api/ws`, mit dem Session-Cookie; die Mobile App schickt stattdessen zuerst
`{"type":"auth","token":"…"}`. `user:<id>` lässt sich nur für den eigenen Benutzer abonnieren.

Client → Server: `{"type":"subscribe","topics":["event:<id>"]}`, `{"type":"unsubscribe",…}`
Server → Client: `{"type":"invalidate","topics":["event:<id>"]}` – betroffene Queries neu laden;
`{"type":"resync"}` – Änderungen evtl. verpasst, alle Queries neu laden.
