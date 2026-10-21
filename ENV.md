# Environment Variables Guide

BazarPro consists of the app (Vite build served by a small Node server) and the backend
(`backend/`, Rust with Postgres). The browser talks to the backend under the app's own
domain at `/api`: Traefik routes it in production, Vite proxies it in development.

## Frontend (Vite)

These variables must start with `VITE_` to be accessible in the browser.

| Variable                  | Required | Description                                                                                              |
| :------------------------ | :------- | :------------------------------------------------------------------------------------------------------- |
| `VITE_SITE_URL`           | No       | The public URL of the application (e.g., `https://bazarpro.de`). Used for SEO and absolute links.        |
| `VITE_BAZARPRO_MODE`      | No       | `single` to try the self-hosting mode with `vite dev`. In production the server injects `BAZARPRO_MODE`. |
| `DOMAIN_NAME`             | No       | Base domain used for routing and Plausible analytics. Defaults to `localhost`.                           |
| `VITE_PLAUSIBLE_API_HOST` | No       | API host for self-hosted Plausible Analytics instances.                                                  |
| `BACKEND_URL`             | No       | Where Vite (`dev`, `preview`, prerendering) forwards `/api` to. Defaults to `http://127.0.0.1:3000`.     |

## Web Server (runtime)

The Node server (`server/index.ts`) passes these values to the browser at runtime (`window.__BAZARPRO_CONFIG__`), so one image works under any domain. They take precedence over the build-time `VITE_*` values above.

| Variable             | Description                                                                                                               |
| :------------------- | :------------------------------------------------------------------------------------------------------------------------ |
| `BACKEND_URL`        | Address of the backend inside the network (e.g. `http://backend:3000`), for server-side SEO and the live sitemap.         |
| `SITE_URL`           | Public URL of the app. Replaces the site URL the image was built with in canonical links etc.                             |
| `PLAUSIBLE_DOMAIN`   | Domain registered in Plausible Analytics. Tracking only runs if the page is served from it.                               |
| `PLAUSIBLE_API_HOST` | API host of your Plausible instance. Admins can override both values or switch analytics off under Admin > Einstellungen. |
| `BAZARPRO_MODE`      | `platform` (default) or `single`. In `single` mode the marketing pages are not served.                                    |

For self-hosting, see `docker-compose.selfhost.yml` and `.env.selfhost.example`.

## Backend

Database, sign-in (SMTP, Google, GitHub), uploads (directory or S3) and the instance
settings: see the table in [`backend/README.md`](backend/README.md#umgebungsvariablen).
The most important ones are `DATABASE_URL`, `SITE_URL`, `BAZARPRO_MODE`, `ADMIN_EMAIL`
and `AUTH_SMTP_*`.

## CI/CD & Infrastructure (Ansible/GitHub)

Controls the deployment pipeline and server configuration.

| Variable                                        | Required | Description                                                                         |
| :---------------------------------------------- | :------- | :---------------------------------------------------------------------------------- |
| `SSH_HOST`                                      | **Yes**  | IP address or domain of the target server.                                          |
| `SSH_USER`                                      | **Yes**  | SSH username for Ansible (e.g., `ubuntu` or `root`).                                |
| `SSH_PRIVATE_KEY`                               | **Yes**  | Base64 encoded private key for server access.                                       |
| `REGISTRY_URL`                                  | Auto     | Defaults to `ghcr.io`.                                                              |
| `REGISTRY_IMAGE`                                | Auto     | Defaults to `ghcr.io/OWNER/REPO`; the backend image is `…/backend`.                 |
| `REGISTRY_USER`                                 | Auto     | Automatically uses the GitHub Action actor.                                         |
| `REGISTRY_PASSWORD`                             | Auto     | Automatically uses the `GITHUB_TOKEN`.                                              |
| `DOMAIN_NAME`                                   | **Yes**  | Domain of production; review apps run on `review-<PR>.<DOMAIN_NAME>`.               |
| `POSTGRES_PASSWORD`                             | **Yes**  | Password of the production database. Set once, never change it.                     |
| `ADMIN_EMAIL`, `AUTH_SMTP_*`, `AUTH_EMAIL_FROM` | **Yes**  | Written to `backend.env` on the server.                                             |
| `AUTH_GITHUB_*`, `AUTH_GOOGLE_*`                | No       | OAuth sign-in; callback `https://<DOMAIN_NAME>/api/auth/oauth/<provider>/callback`. |
| `CLOUDFLARE_DNS_API_TOKEN`                      | **Yes**  | Cloudflare API token (Zone:DNS:Edit) for Traefik's ACME DNS challenge.              |

---

## Local Development Setup

```bash
docker compose -f backend/docker-compose.dev.yml up -d postgres
export DATABASE_URL=postgres://bazarpro:bazarpro@127.0.0.1:55432/bazarpro STORAGE_DIR=.files
npm run seed        # demo data; `-- --locale en` for English, e.g. for screenshots
npm run dev:full    # backend on :3000 and Vite on :5173
```

Without `AUTH_SMTP_HOST` the backend only logs emails, including the sign-in codes.

> **Security Note:** Never commit `.env` files or any file containing real secrets to version control.
