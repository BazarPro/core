# Lasttests

k6-Szenarien gegen ein laufendes Backend, so wie die App es benutzt: Abfragen über HTTP,
Live-Updates über `/api/ws`, bei jeder Änderung lädt der Client die betroffenen Abfragen neu.

| Skript      | Was passiert                                                                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `browse.js` | Lesekapazität: Besucher laden die öffentliche Eventseite ohne Pause (`VUS`, `DURATION`)                                                                                                                                   |
| `bazaar.js` | Basartag: `CASHIERS` Kassen scannen, verkaufen und stornieren (damit der Artikel verkaufbar bleibt), dazu `VISITORS` Besucher, die die Eventseite `STAY` Sekunden mit Live-Updates offen haben (`DURATION`, `CASH_THINK`) |

**Nie gegen die Review-Apps oder Produktion:** Sie laufen auf demselben Server wie bazarpro.de.

## Ablauf

Voraussetzungen: Docker (k6 läuft als Image `grafana/k6`), Node, ein Release-Build.

```sh
# Eigene Datenbank, z. B. im Dev-Postgres (backend/docker-compose.dev.yml)
docker compose -f backend/docker-compose.dev.yml exec postgres createdb -U bazarpro bench
export DATABASE_URL=postgres://bazarpro:bazarpro@127.0.0.1:55432/bench STORAGE_DIR=/tmp/bench-files

cargo build --release --manifest-path backend/Cargo.toml
backend/target/release/bazarpro-backend import export.zip   # echte Daten (npx convex export …) oder: seed
backend/target/release/bazarpro-backend &                   # lauscht auf :3000

node backend/bench/prepare.mjs     # Kassen-Accounts, Artikel → backend/bench/.data.json
BACKEND_PID=$(pgrep -f release/bazarpro-backend) backend/bench/run.sh bazaar.js tag500 -e VISITORS=500
```

`run.sh` legt k6-Export und Log unter `backend/bench/results/` ab und gibt Latenzen aus,
mit `BACKEND_PID` auch die CPU-Zeit des Backends. Für vergleichbare Zahlen das Backend so
starten wie in Produktion (`DATABASE_MAX_CONNECTIONS` 10) und Postgres direkt ansprechen
statt über den Docker-Portproxy (`docker inspect` → IP des Containers): der Proxy allein
kostet unter Last mehr als ein CPU-Kern.

`prepare.mjs` schaltet `is_e2e_auth_skip_email` ein und macht die Kassen-Accounts zu
Admins (dürfen an jeder Kasse verkaufen). Nur auf einer eigenen Datenbank benutzen.

### Daten

Nach einem Import ist die Veranstaltung meist vorbei: Artikel zurückgegeben, Verkäufer
ausbezahlt. Für einen Basartag (auch nach abgebrochenen Läufen, die zwischen Verkauf und
Storno endeten):

```sql
UPDATE event_products SET status = 'available';
UPDATE event_sellers SET payout_received = false;
```

## Messung vom 21.10.2026

Produktionsexport vom 30.04.2026 (1 Veranstaltung, 120 Artikel, 82 Nutzer, 211 Bilder),
alles auf einem Rechner mit 16 Kernen inklusive k6. Die Zahlen taugen zum Vergleichen,
nicht als Kapazität des Produktionsservers. Convex: self-hosted wie in Produktion
(SQLite), angesprochen über seinen Sync-WebSocket wie vom Convex-Client.

Lesen (`browse.js`, 50 Besucher ohne Pause):

|                      | Requests/s | Median | CPU Backend + Postgres |
| -------------------- | ---------: | -----: | ---------------------: |
| Convex               |      3 477 |   7 ms |              4,0 Kerne |
| Rust vorher          |      2 139 |  20 ms |              7,1 Kerne |
| Rust mit Cache, gzip |      5 637 | 1,3 ms |              0,6 Kerne |

Kasse (`bazaar.js`, 20 Kassen, keine Besucher): Verkauf Median / p95 bei Convex
154 / 614 ms, Rust 9–10 / 36–47 ms.

Basartag (`bazaar.js`, 20 Kassen, Besucher bleiben 30 s), Laden der Eventseite
Median / p95:

| Besucher | Convex         | Rust vorher  | Rust mit Cache, gzip |
| -------: | -------------- | ------------ | -------------------- |
|      200 | 414 / 2 926 ms | 652 / 968 ms | 45 / 583 ms          |
|      500 | 1,5 / 6,4 s    | 2,0 / 2,8 s  | 0,26 / 1,6 s         |
|     1000 | 2,2 / 6,8 s ¹  | 6,6 / 8,3 s  | 1,2 / 2,6 s          |

¹ Convex lehnte 1 694 Abfragen ab („Too many concurrent requests“) und beendete sich mit
Dockers Standardlimit von 1024 offenen Dateien ganz. Das Rust-Backend nimmt mit diesem
Limit ab rund 1000 Besuchern keine Verbindungen mehr an; daher `ulimits.nofile` im Compose.

Mit Cache rechnet Postgres im Basartag 16 statt 270 CPU-Sekunden. Pro Live-Update gehen
mit gzip rund 36 statt 77 KB über die Leitung; bei 200 Besuchern sind das trotzdem
1,7 GB in zwei Minuten, weil jeder Verkauf die ganze Artikelliste neu laden lässt.
