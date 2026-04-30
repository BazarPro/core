# BazarPro

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

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
- **Backend:** [Convex](https://www.convex.dev/) (Real-time Database, Serverless Functions, Auth, Storage).
- **Infrastructure:** Docker, Nginx, Ansible (for automated deployments).
- **Testing:** Vitest, Playwright (E2E), Convex-test.

---

## Quick Start

### 1. Installation

```bash
npm install
```

### 2. Local Development

Run the Convex backend and the Vite frontend simultaneously:

```bash
# Terminal 1: Convex Backend
npx convex dev

# Terminal 2: Frontend
npm run dev
```

Navigate to `http://localhost:5173`.

### 3. Demo Data

Populate your local environment with sample users, events, and products:

```bash
npm run seed
```

---

## Project Structure

```text
├── ansible/          # Deployment playbooks and server configuration
├── convex/           # Backend schema, serverless functions (queries, mutations)
│   ├── auth.ts       # Authentication logic
│   ├── schema.ts     # Database definitions
│   └── tests/        # Backend-specific tests
├── scripts/          # Prerendering, SEO generation, and backup scripts
├── src/
│   ├── components/   # UI library (shadcn/ui) and shared components
│   ├── hooks/        # Custom React hooks (auth, feature flags, etc.)
│   ├── lib/          # Utilities (PDF generation, image processing)
│   └── pages/        # Application routes (organized by Role)
└── playwright/       # E2E test suites
```

## Development Environment

### Dev Container

For a consistent development experience, BazarPro includes a pre-configured **Dev Container** for Visual Studio Code. This environment comes with all necessary dependencies, including Node.js 22, and essential extensions (ESLint, Prettier, Playwright).

- **How to use:** Open the project folder in VS Code and click "Reopen in Container" when prompted.
- **Forwarded Ports:**
  - `5173`: Frontend (Vite)
  - `3210`: Convex Backend API
  - `3211`: Convex Dashboard (Local)

---

## Testing

- **Unit & Integration:** `npm run test`
- **Backend Logic:** `npx vitest run convex/`
- **End-to-End:** `npm run test:e2e`
- **Coverage:** `npm run test:coverage`
- **Run all tests:** `npm test:all`
- **Run E2E tests with UI Interaction:** `npx playwright test --ui`

---

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

To automatically generate backups of the production convex database, set up a cron job on the server that runs the `backup.sh` script located in the `scripts/` directory. A example docker service is provided in the `docker-compose.yml` file for reference.

---

## Configuration & Flags

BazarPro is highly configurable through environment variables and feature flags.

### Environment Variables

Detailed information about all configuration options for the frontend, backend, and CI/CD pipelines can be found in the [ENV.md](./ENV.md) file.

### Feature Flags

Manage system capabilities (e.g., event creation, demo mode) via the Convex Dashboard or CLI:

```bash
# Example: Toggle event creation
npx convex run seed:toggleFeatureFlag '{"key": "is_event_creation_enabled"}'
```

#### Default Feature Flags after seeding:

- **is_demo_mode**: Shows a demo banner on the landing page. Default is `true`.
- **is_login_enabled**: Enables the login page. Default is `true`.
- **is_registration_enabled**: Enables the registration page. Default is `true`.
- **is_event_creation_enabled**: Enables creation of new events. Default is `true`.
- **allow_undo_inventory_actions**: Enables the ability to undo sales and returns in the inventory (On-Site Tool). Default is `false` in code, but `true` after seeding.
- **is_create_products_on_signup_enabled**: Enables automatic creation of starter products for new users. Default is `true`.
- **is_e2e_auth_skip_email**: Skips SMTP delivery in E2E and stores auth verification codes for tests. Default is `false`.
