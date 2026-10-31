# Lasttests

k6-Szenarien gegen ein laufendes Backend, so wie die App es benutzt: Abfragen über HTTP,
Live-Updates über `/api/ws`. Wie `src/lib/api/client.ts` lädt eine geänderte Abfrage nach
bis zu 300 ms und höchstens einmal pro Sekunde neu; ändert sich das im Client, hier mit.

| Skript      | Was passiert                                                                                                                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `browse.js` | Lesekapazität: Besucher laden die öffentliche Eventseite ohne Pause (`VUS`, `DURATION`)                                                                                                                                                                                  |
| `bazaar.js` | Basartag: `CASHIERS` Kassen scannen, verkaufen und stornieren (damit der Artikel verkaufbar bleibt), dazu `VISITORS` Besucher, die die Eventseite `STAY` Sekunden mit Live-Updates offen haben (`DURATION`, `CASH_THINK`), davon der Anteil `SIGNED_IN` (0–1) angemeldet |

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

node backend/bench/prepare.mjs     # Kassen- und Besucher-Accounts, Artikel → backend/bench/.data.json
BACKEND_PID=$(pgrep -f release/bazarpro-backend) backend/bench/run.sh bazaar.js tag500 -e VISITORS=500
```

`run.sh` legt k6-Export und Log unter `backend/bench/results/` ab und gibt Latenzen aus,
mit `BACKEND_PID` auch die CPU-Zeit des Backends. Für vergleichbare Zahlen das Backend so
starten wie in Produktion (`DATABASE_MAX_CONNECTIONS` 10) und Postgres direkt ansprechen
statt über den Docker-Portproxy (`docker inspect` → IP des Containers): der Proxy allein
kostet unter Last mehr als ein CPU-Kern.

`prepare.mjs` schaltet `is_e2e_auth_skip_email` ein und macht die Kassen-Accounts zu
Admins (dürfen an jeder Kasse verkaufen). Nur auf einer eigenen Datenbank benutzen.
Angemeldete Besucher (`SIGNED_IN`) nutzen `VISITOR_ACCOUNTS` (200) Accounts ohne Rolle
an der Veranstaltung, wie Käufer. Ihre Latenzen stehen getrennt als `*_signed_in`.

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

Ab etwa 500 Besuchern bremst k6 selbst: Bei 1000 brauchte es 11 von 16 Kernen, das
Backend einen. Für mehr Last k6 auf einem zweiten Rechner laufen lassen.

¹ Convex lehnte 1 694 Abfragen ab („Too many concurrent requests“) und beendete sich mit
Dockers Standardlimit von 1024 offenen Dateien ganz. Das Rust-Backend nimmt mit diesem
Limit ab rund 1000 Besuchern keine Verbindungen mehr an; daher `ulimits.nofile` im Compose.

Mit Cache rechnet Postgres im Basartag 16 statt 270 CPU-Sekunden. Pro Live-Update gehen
mit gzip rund 36 statt 77 KB über die Leitung.

### Live-Updates gebündelt, Antworten vorkomprimiert

Nachmessung am selben Tag: Der Client lädt bei Änderungen anderer höchstens einmal pro
Sekunde und Abfrage, gecachte Antworten werden einmal komprimiert. Basartag mit 20 Kassen,
zwei Läufe je Stand (Spannen):

|                         | 200 Besucher vorher | nachher      | 500 Besucher vorher | nachher      |
| ----------------------- | ------------------- | ------------ | ------------------- | ------------ |
| Eventseite Median / p95 | 43–290 / ~1 400 ms  | 5 / 13–25 ms | 539 / 2 409 ms      | 7 / 1 186 ms |
| Übertragen (2 Minuten)  | 0,9–1,2 GB          | 0,27 GB      | 1,35 GB             | 0,64 GB      |
| Backend-CPU             | 0,75–1,2 Kerne      | 0,15–0,22    | 1,0 Kerne           | 0,48 Kerne   |

## Messung vom 31.10.2026: angemeldete Besucher (#228)

Demo-Daten (`seed`, Veranstaltung mit 75 Artikeln), Postgres 17 mit Standardkonfiguration,
`DATABASE_MAX_CONNECTIONS` 10, k6 auf demselben Rechner (12 Kerne, nicht exklusiv).
Basartag mit 20 Kassen, Besucher bleiben 30 s. Eventseite Median / p95, angemeldete
Besucher getrennt:

| Besucher, angemeldet | vorher anonym | vorher angemeldet | nachher anonym | nachher angemeldet |
| -------------------- | ------------- | ----------------- | -------------- | ------------------ |
| 500, 100 %           | –             | 13 / 61 ms        | –              | 9 / 26 ms          |
| 1000, 0 %            | 6 / 107 ms    | –                 | 6 / 95 ms      | –                  |
| 1000, 50 %           | 10 / 408 ms   | 33 / 1 706 ms     | 6 / 121 ms     | 10 / 183 ms        |
| 1000, 100 %          | –             | –                 | –              | 14 / 364 ms        |

Vorher lief jede Abfrage eines angemeldeten Besuchers gegen Postgres. Bei 1000 Besuchern,
davon die Hälfte angemeldet, war nicht die CPU knapp (Backend 1,1, Postgres 0,5 Kerne),
sondern der Pool: Auch der Verkauf an der Kasse brauchte im Median 495 statt 28 ms.
Nachher bekommen Angemeldete ohne Rolle an der Veranstaltung die Antworten der Besucher
(`registry.share`), der Verkauf liegt bei 35 ms (Median) / 111 ms (p95). Was bleibt, ist pro
Anfrage die Session und die Rollenprüfung sowie `users.viewer`; bei 1000 Angemeldeten
Verkauf 63 / 153 ms.
