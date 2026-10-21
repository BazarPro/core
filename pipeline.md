# CI/CD Pipeline & Deployment Strategy

This document provides a comprehensive overview of the BazarPro CI/CD pipeline, explaining the automated lifecycle of the application from code quality checks to production deployment.

> [!IMPORTANT]
> All sensitive information, environment variables, and secrets required for the pipeline and deployments are documented in [ENV.md](./ENV.md). Please refer to it before modifying or troubleshooting the pipeline.

---

## Pipeline Overview

The pipeline is hosted on GitHub Actions and is designed to ensure code quality, verify functionality through automated tests, and provide ephemeral preview environments for rapid feedback.

### Workflow Rules

The pipeline is triggered automatically in the following scenarios:

- **Pull Requests (PR):** Runs full validation and deploys a Review App with its own backend and database.
- **Git Tags:** Triggers a production build and deployment to the self-hosted environment. The release image is also tagged `latest`.
- **Branches (`main`, `development`):** Validate the code only (lint, typecheck, tests). No image is built; `latest` only moves with a release.

---

## Pipeline Stages

The pipeline consists of several sequential stages, each with a specific purpose:

### 1. `check` (Quality Assurance)

Performs fast static analysis to catch issues early.

- **`lint`**: Runs `npm run lint` to enforce coding standards.
- **`typecheck`**: Validates TypeScript types across the project using `tsc`.
- **`ansible-check`**: Ensures the deployment scripts are valid. It runs `ansible-lint` and performs a syntax check on the playbooks.

### 2. `test` (Unit & Integration)

Verifies the core logic of the application.

- **`test`**: Executes the Vitest suite (app and web server). It generates JUnit reports for GitHub Actions integration and coverage reports to monitor test depth.
- **`backend-test`**: `cargo fmt --check`, `cargo clippy -D warnings` and `cargo test` (both `--locked`) of `backend/` against a Postgres service container.
- **`backend-deps`**: `cargo deny check` of `backend/`: known vulnerabilities (RustSec), licenses and sources of the crates, configured in `backend/deny.toml`. The images do not wait for it, so a new advisory does not block a hotfix release.

### 3. `test-e2e` (End-to-End Testing)

Simulates real user interactions against the backend of the commit.

- **`e2e-test`**: (PR only) A Postgres service container holds the throwaway database `bazarpro_e2e`. Playwright builds and starts the backend and the Vite dev server (`playwright.config.ts`); the global setup wipes the database and loads the demo data through the backend CLI.
  - Locally: create the database once (`createdb bazarpro_e2e` on the dev Postgres of `backend/docker-compose.dev.yml`), then `npm run test:e2e`. The database name must end in `_e2e` or `_test`, so a real database is never wiped; another one is set with `E2E_DATABASE_URL`.
  - Chromium runs for every PR. Firefox runs only for PRs into `main` (`PLAYWRIGHT_FIREFOX`); locally both run by default.

### 4. `build-image` (Containerization)

Packages the application for deployment.

- **`build-image`** (pull requests and release tags only):
  - Prerenders against the live site's backend (`BACKEND_URL=https://<DOMAIN>` build arg).
  - Also builds the backend image (`<image>/backend`, `backend/Dockerfile`), used by production, review apps and self-hosters.
  - Builds the Docker image and pushes it to the registry.
  - Tags the image with the commit SHA (PRs) or the Git tag plus `latest` (releases).
  - Prerenders the landing, marketing and legal pages (`scripts/prerender-public.js`).

#### Frontend server (`server/`)

The image runs a small dependency-free Node server (`node server/index.ts`, port 8080) instead of nginx:

- Serves the build: prerendered pages, `spa.html` as SPA fallback, `/assets/*` with immutable caching, gzip.
- **Server-side SEO** for `/public-events/:id`, `/public-events/:id/products` and `/products/view/:id`: loads the data from the backend (`BACKEND_URL`) and injects title, description, Open Graph, canonical and JSON-LD into the shell. Unknown or unapproved ids return `404` with `noindex`. If the backend is unreachable, the plain shell is served.
- **Live sitemap** at `/sitemap.xml` from current public events; falls back to the build-time file.
- `SITE_URL` is baked in from the `VITE_SITE_URL` build arg and can be overridden at runtime; `BACKEND_URL` defaults to `http://backend:3000`; `/healthz` backs the Docker healthcheck.
- Head tags must match `src/components/seo/Seo.tsx` (same element ids), see `server/seo.ts`.

### 5. `deploy` (Production Release)

Automates the release to the self-hosted production server.

- **`deploy`**: (Tags only) Uses Ansible to:
  1. Write `.env` and `backend.env` from the secrets.
  2. Dump the production database (`backups/predeploy_*.dump`).
  3. Pull and restart the containers with the images of the tag; the backend migrates the database on start.
- **`release`**: (Tags only) Creates a GitHub release with generated notes after a successful deploy.

### 6. `review` (Ephemeral Previews)

Provides a live URL for every Pull Request to facilitate manual testing and stakeholder review.

- **`deploy-review`**: Provisions an ephemeral instance of the application on the production server, accessible via a unique subdomain (e.g., `https://review-<PR-ID>.<DOMAIN>`). Each review app runs its own backend and Postgres (`/api` on the same subdomain); a one-shot `seed` container loads the demo data with photos on first start.
  - Later deploys keep the data; the seed only moves the running demo bazaars (the showcase "Fahrradbörse Bürgerhalle (alle Funktionen)" and the kids' bazaar) to today.
  - Every mail of the review app (login codes, notifications, receipts) goes to its own [Mailpit](https://mailpit.axllent.org/) and never leaves the server. The inbox is at `https://review-<PR-ID>-mail.<DOMAIN>` (user `review`, password from the repository secret `REVIEW_MAIL_PASSWORD`; without the secret the inbox is not exposed).
- **`cleanup-review`**: Runs when the PR is closed or merged and removes the review instance, including its database and files, from the server.

---

## Release Process

`development` is the integration branch, `main` always reflects production.

1. Merge feature PRs into `development` (Chromium E2E, review app per PR).
2. Open a PR `development` → `main` (also runs Firefox E2E) and merge it with **"Create a merge commit"**.
3. Tag the merge commit on `main` and push the tag:

   ```bash
   git switch main && git pull
   git tag -a v1.2.3 -m "v1.2.3"
   git push origin v1.2.3
   ```

4. The pipeline builds the images, backs up the database, deploys and creates the GitHub release.

Notes:

- Docs-only changes (`**.md`, `LICENSE`) do not trigger the pipeline.
- A newer push to a PR cancels its outdated run; production deploys never run in parallel.

---

## Ansible Deep Dive

Ansible is the backbone of our infrastructure management, handling everything from database backups to container orchestration.

### Key Roles

| Role                | Purpose                                                                                                                                                                                                                                                                |
| :------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`docker_deploy`** | Orchestrates the production environment. It manages the `proxy` network (Traefik), generates the production `.env` file from templates, dumps the database before the update and ensures all services (App, backend, Postgres, backup, Traefik) are running correctly. |
| **`docker_review`** | Dynamically creates and manages ephemeral Review Apps. It sets up isolated directories and Docker Compose projects (frontend, backend, Postgres, Mailpit) for each PR, ensuring they are routed correctly via Traefik.                                                 |

---

## Relevant Files

- [`.github/workflows/pipeline.yml`](./.github/workflows/pipeline.yml) - The core pipeline definition.
- [`ENV.md`](./ENV.md) - Documentation for all required variables and secrets.
- [`ansible/`](./ansible/) - Contains all playbooks and roles for infrastructure management.
- [`docker-compose.yml`](./docker-compose.yml) - Service definitions for production and infrastructure.
