# BazarPro

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docs](https://img.shields.io/badge/Docs-docs.bazarpro.de-1d3fe0.svg)](https://docs.bazarpro.de)

> 📖 **Documentation (German):** guides for organizers, sellers and visitors at **[docs.bazarpro.de](https://docs.bazarpro.de)** ([source](https://github.com/BazarPro/docs)).

BazarPro is a modern, real-time platform designed to streamline the organization and execution of bazaar-style events—from local bicycle markets to community flea markets. It handles everything from product registration and QR-code labeling to on-site sales and automated payout calculations.

## Key Features

### For Organizers

- **Event Management:** Create and configure events with specific commissions, fees, and categories.
- **On-Site Tooling:** Integrated QR-code scanner for rapid sales processing and real-time inventory updates.
- **Insights:** Monitor sales, participant activity, and financial summaries.
- **Feature Flags:** Toggle system capabilities (e.g., registrations, demo mode) on the fly without redeploying.

### For Sellers

- **Digital Inventory:** Register products with images, descriptions, and pricing.
- **QR-Code Labels:** Generate and print unique QR-codes for each item to facilitate secure, fast checkouts.
- **Event Participation:** Join multiple events and track the status of your items (available, sold, returned).
- **Automated Payouts:** Transparent view of earnings after event commissions.

### For Buyers

- **Live Catalog:** Browse available items online before and during the event.
- **SEO Optimized:** Event and product pages are pre-rendered for better search engine visibility.

---

## License

This project is licensed under the **MIT License**. See the [LICENSE](./LICENSE) file for the full license text.

---

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Radix UI.
- **Backend:** Rust (Axum, sqlx) with PostgreSQL (`backend/`): live updates over WebSocket, sign-in, uploads, emails and cron jobs.
- **Infrastructure:** Docker, Traefik, a small Node server with server-side SEO (`server/`), Ansible (for automated deployments).
- **Testing:** Vitest, Playwright (E2E), `cargo test` (backend, one database per test).

---

## Quick Start

### 1. Installation

```bash
npm install
```

### 2. Local Development

Start Postgres, then the backend and the Vite frontend (Rust via [rustup](https://rustup.rs)):

```bash
docker compose -f backend/docker-compose.dev.yml up -d postgres
export DATABASE_URL=postgres://bazarpro:bazarpro@127.0.0.1:55432/bazarpro STORAGE_DIR=.files
npm run dev:full    # backend on :3000, Vite on :5173 (forwards /api to the backend)
```

Navigate to `http://localhost:5173`.

### 3. Demo Data

Populate your local environment with sample users, events, and products:

```bash
npm run seed                    # German
npm run seed -- --locale en     # English, e.g. for screenshots
```

All demo accounts use the password `123456`, e.g. `admin@bazarpro.de`, `user1@bazarpro.de` or
`sarah.miller@example.org` (English) / `sabine.krause@example.org` (German), the organizer of the
running kids' bazaar.

---

## Project Structure

```text
├── ansible/          # Deployment playbooks and server configuration
├── backend/          # Rust backend: migrations, modules (one per area), auth, demo data, tests
├── scripts/          # Prerendering, SEO generation, and backup scripts
├── src/
│   ├── components/   # UI library (shadcn/ui) and shared components
│   ├── hooks/        # Custom React hooks (auth, feature flags, etc.)
│   ├── lib/          # Utilities (PDF generation, image processing), lib/api: backend client
│   ├── shared/       # Constants and rules the app shares with the backend's behaviour
│   └── pages/        # Application routes (organized by Role)
└── playwright/       # E2E test suites
```

## Development Environment

### Dev Container

For a consistent development experience, BazarPro includes a pre-configured **Dev Container** for Visual Studio Code. This environment comes with all necessary dependencies, including Node.js 22, and essential extensions (ESLint, Prettier, Playwright).

- **How to use:** Open the project folder in VS Code and click "Reopen in Container" when prompted.
- **Forwarded Ports:**
  - `5173`: Frontend (Vite)
  - `3000`: Backend

---

## Testing

- **Unit & Integration:** `npm run test`
- **Backend:** `cd backend && cargo test` (needs `DATABASE_URL`, see above)
- **End-to-End:** `npm run test:e2e`
- **Coverage:** `npm run test:coverage`
- **Run all tests:** `npm test:all`
- **Run E2E tests with UI Interaction:** `npx playwright test --ui`

---

## Self-Hosting

Run your own BazarPro instance with Docker on a single server – no build, no CI required:

```bash
curl -O https://raw.githubusercontent.com/BazarPro/core/main/docker-compose.selfhost.yml
curl -o .env https://raw.githubusercontent.com/BazarPro/core/main/.env.selfhost.example
# edit .env: domain, e-mail for Let's Encrypt, SMTP server
docker compose -f docker-compose.selfhost.yml up -d
```

The stack contains Traefik (HTTPS via Let's Encrypt), PostgreSQL, the BazarPro backend and the web app, all under one domain (`/api` goes to the backend). The site URL is read at runtime, so the published images work under any domain.

The account in `ADMIN_EMAIL` becomes administrator once it has signed up; for another account:

```bash
docker compose -f docker-compose.selfhost.yml exec backend bazarpro-backend admin you@example.org
```

Instances still running on Convex move their data with `bazarpro-backend import <export.zip>` (see `backend/README.md`).

Step-by-step guide (German): **[docs.bazarpro.de/selbst-hosten](https://docs.bazarpro.de/selbst-hosten/)**

## Mobile App

The iOS and Android apps wrap the web app with [Capacitor](https://capacitorjs.com) (`android/`, `ios/`, `capacitor.config.ts`). On first start the app asks for the server (bazarpro.de or a self-hosted instance) and then talks to its `/api` with a bearer token instead of the session cookie (`src/native/`).

```bash
npm run build:app      # vite --mode app → dist-app/, then cap sync
npx cap open android   # Android Studio
npx cap open ios       # Xcode (macOS only)
```

Self-hosted instances need nothing extra: the backend allows the app's origins by default (`APP_ORIGINS`). For Google/GitHub sign-in the app opens the system browser and comes back via `bazarpro://auth`.

## Deployment & Infrastructure

### Local Production Test (Docker)

```bash
docker-compose build
docker-compose up
```

### CI/CD (GitHub)

The pipeline handles deployments to self-hosted environments. Ensure all required environment variables are set in GitHub Actions secrets. The Environment Variables are documented in detail in the [ENV.md](./ENV.md) file.
Detailed pipeline documentation (including stage explanations and references to `ENV.md`) is available in [pipeline.md](./pipeline.md).

### Ansible Commands

For manual infrastructure management:

```bash
# Syntax check
uvx --from ansible-core ansible-playbook -i ansible/inventory ansible/site.yml --syntax-check

# Dry-run with diff
uvx --from ansible-core ansible-playbook -i ansible/inventory ansible/site.yml --check --diff
```

The `backup` service of `docker-compose.yml` dumps the database and archives the uploaded files every night (`scripts/backup.sh`, kept for 7 days); `scripts/restore.sh` restores them. Every deploy also dumps the database first.

---

## Configuration & Flags

BazarPro is highly configurable through environment variables and feature flags.

### Environment Variables

Detailed information about all configuration options for the frontend, backend, and CI/CD pipelines can be found in the [ENV.md](./ENV.md) file.

### Feature Flags

Manage system capabilities (e.g., event creation, demo mode) with the backend CLI:

```bash
# Example: Toggle event creation
bazarpro-backend run seed.toggleFeatureFlag '{"key": "is_event_creation_enabled"}'
```

#### Default Feature Flags after seeding:

- **is_demo_mode**: Shows a demo banner on the landing page. Default is `true`.
- **is_login_enabled**: Enables the login page. Default is `true`.
- **is_registration_enabled**: Enables the registration page. Default is `true`.
- **is_event_creation_enabled**: Enables creation of new events. Default is `true`.
- **allow_undo_inventory_actions**: Enables the ability to undo sales and returns in the inventory (On-Site Tool). Default is `false` in code, but `true` after seeding.
- **is_create_products_on_signup_enabled**: Enables automatic creation of starter products for new users. Default is `true`.
- **is_e2e_auth_skip_email**: Skips SMTP delivery in E2E and stores auth verification codes for tests. Default is `false`.
