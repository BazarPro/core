# CI/CD Pipeline & Deployment Strategy

This document provides a comprehensive overview of the BazarPro CI/CD pipeline, explaining the automated lifecycle of the application from code quality checks to production deployment.

> [!IMPORTANT]
> All sensitive information, environment variables, and secrets required for the pipeline and deployments are documented in [ENV.md](./ENV.md). Please refer to it before modifying or troubleshooting the pipeline.

---

## Pipeline Overview

The pipeline is hosted on GitHub Actions and is designed to ensure code quality, verify functionality through automated tests, and provide ephemeral preview environments for rapid feedback.

### Workflow Rules

The pipeline is triggered automatically in the following scenarios:

- **Pull Requests (PR):** Runs full validation and deploys a Review App with its own Convex backend.
- **Git Tags:** Triggers a production build and deployment to the self-hosted environment.
- **Default Branch (`main`):** Validates code and builds the latest image for the registry.

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

- **`test`**: Executes the Vitest suite. It generates JUnit reports for GitHub Actions integration and coverage reports to monitor test depth.

### 3. `test-e2e` (End-to-End Testing)

Simulates real user interactions. No Convex Cloud is involved.

- **`e2e-test`**: (PR only) `scripts/ci/convex-backend.sh` starts a throwaway self-hosted Convex backend in Docker on the runner (same version as production) and deploys the functions with `scripts/selfhost/init.mjs`. Playwright then runs against it with the Vite dev server.
  - Locally: `eval "$(scripts/ci/convex-backend.sh)"`, then `CI=true npx playwright test`; stop it with `scripts/ci/convex-backend.sh stop`.
  - Chromium runs for every PR. Firefox runs only for PRs into `main` (`PLAYWRIGHT_FIREFOX`); locally both run by default.

### 4. `build-image` (Containerization)

Packages the application for deployment.

- **`build-image`**:
  - Injected the appropriate `VITE_CONVEX_URL` (backend of the review app for PRs, production URL for tags/main).
  - Also builds the `convex-init` image, used by self-hosters and review apps to deploy the functions.
  - Builds the Docker image and pushes it to the registry.
  - Tags the image with the Git Tag or Commit SHA.
  - Prerenders the landing, marketing and legal pages (`scripts/prerender-public.js`).

#### Frontend server (`server/`)

The image runs a small dependency-free Node server (`node server/index.ts`, port 8080) instead of nginx:

- Serves the build: prerendered pages, `spa.html` as SPA fallback, `/assets/*` with immutable caching, gzip.
- **Server-side SEO** for `/public-events/:id`, `/public-events/:id/products` and `/products/view/:id`: loads the data via the Convex HTTP API and injects title, description, Open Graph, canonical and JSON-LD into the shell. Unknown or unapproved ids return `404` with `noindex`. If Convex is unreachable, the plain shell is served.
- **Live sitemap** at `/sitemap.xml` from current public events; falls back to the build-time file.
- `CONVEX_URL` and `SITE_URL` are baked in from the `VITE_CONVEX_URL` / `VITE_SITE_URL` build args; `/healthz` backs the Docker healthcheck.
- Head tags must match `src/components/seo/Seo.tsx` (same element ids), see `server/seo.ts`.

### 5. `deploy` (Production Release)

Automates the release to the self-hosted production server.

- **`deploy`**: (Tags only) Uses Ansible to:
  1. Backup the existing production database.
  2. Deploy the new Convex backend schema and functions.
  3. Update the production Docker containers with the image of the tag.
- **`release`**: (Tags only) Creates a GitHub release with generated notes after a successful deploy.

### 6. `review` (Ephemeral Previews)

Provides a live URL for every Pull Request to facilitate manual testing and stakeholder review.

- **`deploy-review`**: Provisions an ephemeral instance of the application on the production server, accessible via a unique subdomain (e.g., `https://review-<PR-ID>.<DOMAIN>`). Each review app runs its own Convex backend (`review-<PR-ID>-convex.<DOMAIN>`, HTTP actions on `review-<PR-ID>-convex-site.<DOMAIN>`); `convex-init` deploys the functions of the PR and loads the demo data on first start.
  - Later deploys keep the data; the seed only moves the showcase event ("Fahrradbörse Bürgerhalle (alle Funktionen)") so that it is running again.
  - Every mail of the review app (login codes, notifications, receipts) goes to its own [Mailpit](https://mailpit.axllent.org/) and never leaves the server. The inbox is at `https://review-<PR-ID>-mail.<DOMAIN>` (user `review`, password from the repository secret `REVIEW_MAIL_PASSWORD`; without the secret the inbox is not exposed).
- **`cleanup-review`**: Runs when the PR is closed or merged and removes the review instance, including its Convex backend and data, from the server.

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

4. The pipeline builds the image, backs up Convex, deploys and creates the GitHub release.

Notes:

- Docs-only changes (`**.md`, `LICENSE`) do not trigger the pipeline.
- A newer push to a PR cancels its outdated run; production deploys never run in parallel.
- Self-hosted Convex is pinned via `CONVEX_VERSION` in `docker-compose.yml`; bump it deliberately.

---

## Ansible Deep Dive

Ansible is the backbone of our infrastructure management, handling everything from database backups to container orchestration.

### Key Roles

| Role                | Purpose                                                                                                                                                                                                        |
| :------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`convex`**        | Manages the self-hosted backend. It validates the configuration, performs an automated database export (backup) before changes, and deploys the backend logic.                                                 |
| **`docker_deploy`** | Orchestrates the production environment. It manages the `proxy` network (Traefik), generates the production `.env` file from templates, and ensures all services (App, Convex, Traefik) are running correctly. |
| **`docker_review`** | Dynamically creates and manages ephemeral Review Apps. It sets up isolated directories and Docker Compose projects (frontend and Convex backend) for each PR, ensuring they are routed correctly via Traefik.  |

---

## Relevant Files

- [`.github/workflows/pipeline.yml`](./.github/workflows/pipeline.yml) - The core pipeline definition.
- [`ENV.md`](./ENV.md) - Documentation for all required variables and secrets.
- [`ansible/`](./ansible/) - Contains all playbooks and roles for infrastructure management.
- [`docker-compose.yml`](./docker-compose.yml) - Service definitions for production and infrastructure.
