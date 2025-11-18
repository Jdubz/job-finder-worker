# Staging vs. Production Parity Checklist (MIG-4)

Track configuration alignment across environments before production cutover.

## Frontend

| Item                   | Staging Value                          | Production Value                     | Status | Owner    | Notes                                                                                                   |
| ---------------------- | -------------------------------------- | ------------------------------------ | ------ | -------- | ------------------------------------------------------------------------------------------------------- |
| Firebase Project ID    | `static-sites-257923`                  | `static-sites-257923`                | ✅     | Worker A | Project confirmed in deployment docs.                                                                   |
| Hosting Site           | `job-finder-staging` (`.web.app`)      | `job-finder-production` (`.web.app`) | ✅     | Worker A | Staging verified 2025-10-19; production host accessible but pipeline pending secrets.                   |
| Custom Domain          | `job-finder-staging.joshwentworth.com` | `job-finder.joshwentworth.com`       | ✅     | Worker A | Cloudflare proxies already configured per production checklist.                                         |
| GitHub Environment     | `staging`                              | `production`                         | ⚠️     | PM       | Environments provisioned, but approvals matrix needs confirmation with Worker A before Terraform apply. |
| GitHub Secrets         | `FIREBASE_SERVICE_ACCOUNT` (present)   | `FIREBASE_SERVICE_ACCOUNT` (present) | ✅     | PM       | Secret uploaded 2025-10-20 after successful IAM binding; verify rotation policy post-parity run.        |
| `.env` Files           | `apps/web/.env.staging` (TBD)          | `.env.production` (TBD)              | ⚠️     | Worker B | Await FE-BUG-2 environment verification.                                                                |
| Analytics & Monitoring | Firebase Analytics (TBD)               | Firebase Analytics (TBD)             | ⚠️     | Worker B | Confirm instrumentation before go-live.                                                                 |

## Backend (Cloud Functions)

| Item               | Staging                                                                                                                               | Production                             | Status | Owner               | Notes                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------ | ------------------- | -------------------------------------------------------------------- |
| Firebase Project   | `static-sites-257923`                                                                                                                 | `static-sites-257923`                  | ✅     | Worker A            | Shared project for both environments.                                |
| Functions Deployed | `manageJobQueue-staging`, `manageGenerator-staging`, `manageExperience-staging`, `manageContentItems-staging`, `contact-form-staging` | Base functions deployed but unverified | ⚠️     | Worker A            | Need production validation post-secrets.                             |
| CI Workflows       | `deploy-staging.yml` (green)                                                                                                          | `deploy-production.yml` (pending)      | ⚠️     | Worker B            | Production workflow blocked by missing GitHub environment + secrets. |
| Firestore DB       | `portfolio-staging`                                                                                                                   | `(default)`                            | ✅     | Worker A            | Verified in FE production checklist.                                 |
| Auth Claims Matrix | TBD                                                                                                                                   | TBD                                    | 🚫     | Worker A & Worker B | Requires SEC-AUTH-1 validation plan.                                 |

## Worker (Python)

| Item              | Staging                                    | Production                              | Status | Owner    | Notes                                                     |
| ----------------- | ------------------------------------------ | --------------------------------------- | ------ | -------- | --------------------------------------------------------- |
| Deployment Target | Docker Compose staging stack               | Docker Compose prod stack               | ⚠️     | Worker A | Needs verification run from `docker-compose.staging.yml`. |
| Queue Smoke Tests | Not yet run                                | Not yet run                             | 🚫     | Worker A | DATA-QA-1 will supply baseline.                           |
| Service Accounts  | `worker-staging@static-sites-257923` (TBD) | `worker-prod@static-sites-257923` (TBD) | ⚠️     | PM       | Need confirmation of credentials + secret storage.        |
| Monitoring/Alerts | TBD                                        | TBD                                     | 🚫     | PM       | To be defined post-MIG-4.                                 |

## Shared Types

| Item                | Staging                              | Production                           | Status | Owner               | Notes                                         |
| ------------------- | ------------------------------------ | ------------------------------------ | ------ | ------------------- | --------------------------------------------- |
| Package Version     | `job-finder-shared-types@1.1.1`      | `job-finder-shared-types@1.1.1`      | ✅     | Worker A & Worker B | Latest publish confirmed 2025-10-20.          |
| Type Sync in FE     | `package.json` locked to ^1.1.1      | `package.json` locked to ^1.1.1      | ✅     | Worker B            | Verified via workspace `package.json`.        |
| Type Sync in BE     | `package.json` locked to ^1.1.1      | `package.json` locked to ^1.1.1      | ✅     | Worker A            | Verified via backend repo manifest.           |
| Type Sync in Worker | `poetry.lock` / `requirements` (TBD) | `poetry.lock` / `requirements` (TBD) | ⚠️     | Worker A            | Confirm Python worker uses generated schemas. |

## Infrastructure & Access

| Item                  | Staging                                      | Production                                   | Status | Owner    | Notes                                                                                               |
| --------------------- | -------------------------------------------- | -------------------------------------------- | ------ | -------- | --------------------------------------------------------------------------------------------------- |
| Cloudflare DNS        | Records in place for staging subdomain       | Records in place for root domain             | ✅     | Worker A | Configured manually (Terraform unable to manage existing zone); documented in production checklist. |
| SSL Certificates      | Managed via Cloudflare                       | Managed via Cloudflare                       | ✅     | Worker A | Valid certificates confirmed 2025-10-19.                                                            |
| IAM Bindings          | Service account access for deploys (granted) | Service account access for deploys (granted) | ✅     | PM       | IAM policy binding succeeded 2025-10-20; log stored in PM daily checklist.                          |
| Secrets Storage       | GitHub + Firebase (pending)                  | GitHub + Firebase (pending)                  | 🚫     | PM       | Establish central secret strategy per FE-RECOVERY-4 before parity sign-off.                         |
| Monitoring Dashboards | TBD                                          | TBD                                          | ⚠️     | PM       | Define dashboards prior to launch readiness review.                                                 |
