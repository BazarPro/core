# CI/CD Pipeline & Deployment Strategy

This document provides a comprehensive overview of the BazarPro CI/CD pipeline, explaining the automated lifecycle of the application from code quality checks to production deployment.

> [!IMPORTANT]
> All sensitive information, environment variables, and secrets required for the pipeline and deployments are documented in [ENV.md](./ENV.md). Please refer to it before modifying or troubleshooting the pipeline.

---

## Pipeline Overview

The pipeline is hosted on GitHub Actions and is designed to ensure code quality, verify functionality through automated tests, and provide ephemeral preview environments for rapid feedback.

### Workflow Rules

The pipeline is triggered automatically in the following scenarios:

- **Pull Requests (PR):** Runs full validation, creates a Convex Preview, and deploys a Review App.
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

### 3. `prepare` (Environment Setup)

Prepares the necessary backend infrastructure for previewing changes.

- **`convex-preview`**: (PR only) Uses Ansible to create or update a dedicated Convex preview environment. It exports essential variables (like the generated backend URL) to a `dotenv` artifact for subsequent stages.

### 4. `test-e2e` (End-to-End Testing)

Simulates real user interactions against a live environment.

- **`e2e-test`**: Runs Playwright tests against the ephemeral Preview App created in the previous stages. This ensures that the frontend and backend work together seamlessly.

### 5. `build-image` (Containerization)

Packages the application for deployment.

- **`build-image`**:
  - Injected the appropriate `VITE_CONVEX_URL` (Preview URL for PRs, Production URL for Tags/Main).
  - Builds the Docker image and pushes it to the registry.
  - Tags the image with the Git Tag or Commit SHA.

### 6. `deploy` (Production Release)

Automates the release to the self-hosted production server.

- **`deploy`**: (Tags only) Uses Ansible to:
  1. Backup the existing production database.
  2. Deploy the new Convex backend schema and functions.
  3. Update the production Docker containers with the latest image.

### 7. `review` (Ephemeral Previews)

Provides a live URL for every Pull Request to facilitate manual testing and stakeholder review.

- **`deploy-review`**: Provisions an ephemeral instance of the application on the production server, accessible via a unique subdomain (e.g., `https://review-<PR-ID>.<DOMAIN>`).
- **`stop-review`**: (Manual/Automated) Tears down the review instance and cleans up server resources.

---

## Ansible Deep Dive

Ansible is the backbone of our infrastructure management, handling everything from database backups to container orchestration.

### Key Roles

| Role                 | Purpose                                                                                                                                                                                                        |
| :------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`convex`**         | Manages the self-hosted backend. It validates the configuration, performs an automated database export (backup) before changes, and deploys the backend logic.                                                 |
| **`convex_preview`** | Interfaces with the Convex Cloud CLI to provision isolated backend environments for testing. It also handles the injection of required secrets (JWT, SMTP, OAuth) into the preview instance.                   |
| **`docker_deploy`**  | Orchestrates the production environment. It manages the `proxy` network (Traefik), generates the production `.env` file from templates, and ensures all services (App, Convex, Traefik) are running correctly. |
| **`docker_review`**  | Dynamically creates and manages ephemeral Review Apps. It sets up isolated directories and Docker Compose projects for each PR, ensuring they are routed correctly via Traefik.                                |

---

## Relevant Files

- [`.github/workflows/pipeline.yml`](./.github/workflows/pipeline.yml) - The core pipeline definition.
- [`ENV.md`](./ENV.md) - Documentation for all required variables and secrets.
- [`ansible/`](./ansible/) - Contains all playbooks and roles for infrastructure management.
- [`docker-compose.prod.yml`](./docker-compose.prod.yml) - Production service definitions.
