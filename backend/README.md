# BazarPro Backend (Rust)

Ersetzt Convex: Axum + Postgres, ohne Zustand im Prozess, sodass beliebig viele Instanzen
hinter Traefik laufen können. Plan und Stand der Migration: Branch `feat/rust-backend`.

| Convex | Hier |
|---|---|
| Datenbank, Schema | Postgres, `migrations/` (läuft beim Start, Advisory Lock gegen parallele Instanzen) |
| Reaktive `useQuery` | `src/realtime.rs`: `touch(tx, topics)` → `pg_notify` beim Commit → WebSocket `/api/ws` |
| `ctx.scheduler` | `src/jobs.rs`: `enqueue`/`cancel` in der Transaktion der Mutation |
| `convex/crons.ts` | `jobs::CRONS`, je Slot genau einmal über alle Instanzen |
| `@convex-dev/auth` | `src/auth/`: Passwort + E-Mail-Code, Google, GitHub; Session im HttpOnly-Cookie |
| `convex/mail.ts` | `src/mail.rs`: SMTP (lettre) aus einem Job, Texte aus `src/locales/*/mail.json` |

Alle Routen außer `/healthz` liegen unter `/api`; Traefik/der Node-Server leitet `/api` auf
dieselbe Domain wie die App weiter, damit das Session-Cookie First-Party bleibt.

## Anmeldung

| Route | |
|---|---|
| `POST /api/auth/password` | Body wie `signIn('password', …)`: `flow` = `signUp`, `signIn`, `email-verification`, `reset`, `reset-verification`; Antwort `{"signingIn": bool}` |
| `POST /api/auth/signout` | |
| `GET /api/auth/session` | `{"userId": … \| null}` |
| `GET /api/auth/providers` | `{"google": bool, "github": bool}` |
| `GET /api/auth/oauth/{google,github}?redirectTo=/pfad` | Weiterleitung zum Anbieter; Rückkehr über `…/callback`, Fehler nach `/login?error=CODE` |
| `GET /api/auth/e2e-code?email=` | nur mit Flag `is_e2e_auth_skip_email` |

Fehler: `{"code", "params", "message"}`. Codes aus `errors.json` (z. B. `auth.required`) oder
die bisherigen Anmelde-Codes (`ACCOUNT_BANNED`, `ACCOUNT_DELETED`, `INVALID_CREDENTIALS`,
`INVALID_CODE`, `INVALID_PASSWORD`, `ACCOUNT_ALREADY_EXISTS`, `LOGIN_DISABLED`,
`REGISTRATION_DISABLED`, `TOO_MANY_FAILED_ATTEMPTS`, `EMAIL_NOT_VERIFIED`).

Aus Convex importierte Passwörter (Lucia-scrypt) funktionieren weiter und werden bei der
nächsten Anmeldung auf Argon2id umgestellt.

## Entwicklung

```sh
docker compose -f backend/docker-compose.dev.yml up -d postgres
export DATABASE_URL=postgres://bazarpro:bazarpro@127.0.0.1:55432/bazarpro
cd backend
cargo run      # http://127.0.0.1:3000/healthz
cargo test     # jeder Test bekommt eine eigene Datenbank
```

## Umgebungsvariablen

| Variable | Standard | |
|---|---|---|
| `DATABASE_URL` | – | Pflicht |
| `LISTEN_ADDR` | `0.0.0.0:3000` | |
| `DATABASE_MAX_CONNECTIONS` | `10` | pro Instanz |
| `RUN_WORKERS` | `true` | `false`: Instanz führt keine Jobs/Crons aus |
| `RUST_LOG` | `info,sqlx=warn` | |
| `SITE_URL` | `http://localhost:5173` | Links in Mails, OAuth-Callback, `Secure`-Cookies bei https |
| `BAZARPRO_MODE` | `platform` | `single`: selbst gehosteter Verein |
| `ADMIN_EMAIL` | – | wird nach bestätigter Adresse Admin |
| `AUTH_SMTP_HOST`, `_PORT` (587), `_USER`, `_PASS`, `_SECURE` (false), `_STARTTLS` (true), `_EHLO_HOST`, `_TIMEOUT_MS` (30000) | – | ohne Host werden Mails nur geloggt |
| `AUTH_EMAIL_FROM` | `BazarPro <noreply@localhost>` | auch base64-kodiert möglich |
| `AUTH_GOOGLE_ID`/`_SECRET`, `AUTH_GITHUB_ID`/`_SECRET` | – | Callback-URL beim Anbieter: `SITE_URL/api/auth/oauth/<provider>/callback` |

## WebSocket-Protokoll

`/api/ws`, mit dem Session-Cookie. `user:<id>` lässt sich nur für den eigenen Benutzer abonnieren.

Client → Server: `{"type":"subscribe","topics":["event:<id>"]}`, `{"type":"unsubscribe",…}`
Server → Client: `{"type":"invalidate","topics":["event:<id>"]}` – betroffene Queries neu laden;
`{"type":"resync"}` – Änderungen evtl. verpasst, alle Queries neu laden.
