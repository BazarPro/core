# Environment Variables Guide

BazarPro uses environment variables to configure the frontend, backend, and deployment pipelines. This document details all available variables and their purpose.

## Frontend (Vite)

These variables must start with `VITE_` to be accessible in the browser.

| Variable                  | Required | Description                                                                                                |
| :------------------------ | :------- | :--------------------------------------------------------------------------------------------------------- |
| `VITE_CONVEX_URL`         | **Yes**  | The URL of your Convex backend (e.g., `https://happy-animal-123.convex.cloud` or `http://localhost:3210`). |
| `VITE_SITE_URL`           | No       | The public URL of the application (e.g., `https://bazarpro.de`). Used for SEO and absolute links.          |
| `DOMAIN_NAME`             | No       | Base domain used for routing and Plausible analytics. Defaults to `localhost`.                             |
| `VITE_PLAUSIBLE_API_HOST` | No       | API host for self-hosted Plausible Analytics instances.                                                    |

## Backend (Convex & Auth)

These are used by server-side functions or during the deployment process.

| Variable                   | Scope   | Description                                                                           |
| :------------------------- | :------ | :------------------------------------------------------------------------------------ |
| `SITE_URL`                 | Backend | The public URL of the application, used for generating links in emails and redirects. |
| `AUTH_SMTP_HOST`           | Auth    | SMTP server host for sending OTP/Magic Link emails.                                   |
| `AUTH_SMTP_PORT`           | Auth    | SMTP port (defaults to `587`).                                                        |
| `AUTH_SMTP_USER`           | Auth    | Username for SMTP authentication.                                                     |
| `AUTH_SMTP_PASS`           | Auth    | Password for SMTP authentication.                                                     |
| `AUTH_EMAIL_FROM`          | Auth    | The sender address (e.g., `BazarPro <noreply@bazarpro.de>`) Base64 encoded.           |
| `AUTH_SMTP_SECURE`         | Auth    | Whether to use a secure connection (true/false).                                      |
| `AUTH_SMTP_STARTTLS`       | Auth    | Whether to use STARTTLS (true/false).                                                 |
| `AUTH_SMTP_EHLO_HOST`      | Auth    | EHLO host for SMTP server (defaults to the domain of the sender email).               |
| `JWT_PRIVATE_KEY` / `JWKS` | Auth    | Keys for signing and verifying authentication tokens.                                 |

## CI/CD & Infrastructure (Ansible/GitHub)

Controls the deployment pipeline and server configuration.

| Variable                       | Required | Description                                                              |
| :----------------------------- | :------- | :----------------------------------------------------------------------- |
| `SSH_HOST`                     | **Yes**  | IP address or domain of the target server.                               |
| `SSH_USER`                     | **Yes**  | SSH username for Ansible (e.g., `ubuntu` or `root`).                     |
| `SSH_PRIVATE_KEY`              | **Yes**  | Base64 encoded private key for server access.                            |
| `REGISTRY_URL`                 | Auto     | Defaults to `ghcr.io`.                                                                                        |
| `REGISTRY_IMAGE`               | Auto     | Defaults to `ghcr.io/OWNER/REPO`.                                                                             |
| `REGISTRY_USER`                | Auto     | Automatically uses the GitHub Action actor.                                                                   |
| `REGISTRY_PASSWORD`            | Auto     | Automatically uses the `GITHUB_TOKEN`.                                                                        |
| `CONVEX_SELF_HOSTED_URL`       | **Yes**  | Public URL where the self-hosted Convex API is reachable.                |
| `CONVEX_SELF_HOSTED_ADMIN_KEY` | **Yes**  | Admin key generated on the server for self-hosted deployments.           |
| `CONVEX_INSTANCE_SECRET`       | No       | A stable secret to maintain instance identity across container restarts. |
| `CONVEX_PREVIEW_DEPLOY_KEY`    | **Yes**  | Secret key used for Pull Request preview deployments.                    |
| `CONVEX_PREVIEW_RUN_SEED`      | No       | Optional seed for generating consistent preview environments.            |
| `ACME_EMAIL`                   | No       | Email used for Let's Encrypt SSL certificate registration (Traefik).     |

---

## Local Development Setup

For local development, add the following variables to your `.env.convex` file in the root of the project.

```bash
SITE_URL=http://localhost:5173

# Use your own SMTP credentials for testing email functionality
AUTH_SMTP_HOST=smtp.your-email-provider.com
AUTH_SMTP_USER=your-smtp-username
AUTH_SMTP_PASS=your-smtp-password
AUTH_SMTP_PORT=587
AUTH_SMTP_SECURE=false
AUTH_SMTP_STARTTLS=true
AUTH_SMTP_EHLO_HOST=your-domain.com
AUTH_EMAIL_FROM=BazarPro <noreply@localhost> # Should be base64 encoded if used in Convex environment variables e.g. `QmF6YXIgUHJvIDxub3JlcGx5QHplaXQtei5kZT4=`

# For testing the github and google auth providers, you can set the following variables with your own credentials. Make sure to set the callback URLs in your OAuth app settings to `http://localhost:5173/auth/callback` for local development.
AUTH_GITHUB_ID=your-github-client-id
AUTH_GITHUB_SECRET=your-github-client-secret

AUTH_GOOGLE_ID=your-google-client-id
AUTH_GOOGLE_SECRET=your-google-client-secret

# JWT keys for signing and verifying authentication tokens. You can generate these using openssl or https://labs.convex.dev/auth/setup/manual. Make sure to keep the private key secret and only use the public key in the frontend if needed.
JWT_PRIVATE_KEY=your-jwt-private-key
JWKS=your-jwks-public-key

```

You can set the environment variables for Convex using the following command:

```bash
npx convex env set --from-file .env.convex
```

> **Security Note:** Never commit `.env` files or any file containing real secrets to version control.
