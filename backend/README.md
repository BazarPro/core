# BazarPro Backend (Rust)

Ersetzt Convex: Axum + Postgres, ohne Zustand im Prozess, sodass beliebig viele Instanzen
hinter Traefik laufen können. Plan und Stand der Migration: Branch `feat/rust-backend`.

| Convex | Hier |
|---|---|
| Datenbank, Schema | Postgres, `migrations/` (läuft beim Start, Advisory Lock gegen parallele Instanzen) |
| Reaktive `useQuery` | `src/realtime.rs`: `touch(tx, topics)` → `pg_notify` beim Commit → WebSocket `/ws` |
| `ctx.scheduler` | `src/jobs.rs`: `enqueue`/`cancel` in der Transaktion der Mutation |
| `convex/crons.ts` | `jobs::CRONS`, je Slot genau einmal über alle Instanzen |

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

## WebSocket-Protokoll

Client → Server: `{"type":"subscribe","topics":["event:<id>"]}`, `{"type":"unsubscribe",…}`
Server → Client: `{"type":"invalidate","topics":["event:<id>"]}` – betroffene Queries neu laden;
`{"type":"resync"}` – Änderungen evtl. verpasst, alle Queries neu laden.
