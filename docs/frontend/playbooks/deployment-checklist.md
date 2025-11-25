# Frontend Public Deployment Checklist

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

## Objectives

1. Serve the React application via Firebase Hosting in both staging and production environments.
2. Route public traffic through Cloudflare with TLS, caching, and WAF support on the canonical domains `job-finder-staging.joshwentworth.com` and `job-finder.joshwentworth.com`.
3. Automate deployments from GitHub using environment-specific workflows.
4. Manage infrastructure (Firebase resources, Cloudflare records, secrets) with Terraform to keep configuration reproducible.
5. Provide rollback, monitoring, and operational runbooks before go-live.

### Current Domain Map

- **Staging (public)**: `https://job-finder-staging.joshwentworth.com` → Cloudflare proxy → `https://job-finder-staging.web.app` (Firebase Hosting)
- **Production (public)**: `https://job-finder.joshwentworth.com` → Cloudflare proxy → `https://job-finder-production.web.app` (Firebase Hosting)
- Firebase `*.web.app` endpoints remain live for diagnostics and as the origin for CDN purges; Cloudflare should be treated as the user-facing entry point.

## Deployment Procedures

### 1. Domain & Cloudflare Configuration

- Confirm canonical domains (staging: `job-finder-staging.joshwentworth.com`, production: `job-finder.joshwentworth.com`)
- Create Cloudflare DNS records (CNAME to the respective Firebase origins `job-finder-staging.web.app` and `job-finder-production.web.app`) with orange-cloud proxy enabled
- Configure SSL mode to **Full (Strict)** and create page rules for `/*` caching headers if needed
- Set security/WAF rules for common bot mitigation and rate limiting
- Document Cloudflare API tokens and permissions for Terraform and CI usage

### 2. Firebase Hosting Setup

- Validate hosting targets in `.firebaserc` (`job-finder-staging`, `job-finder-production`)
- Ensure Firebase project `static-sites-257923` contains both sites with unique domains
- Configure custom domains within Firebase console to match Cloudflare DNS records
- Enable preview channels for PR validation (`firebase hosting:channel:deploy`)
- Verify CDN caching headers in `firebase.json` align with performance goals

### 3. Infrastructure as Code (Terraform)

- Extend existing Terraform (or create new module) to manage:
  - Firebase Hosting sites (`google_firebase_hosting_site`, `google_firebase_hosting_version`)
  - Cloudflare DNS records and SSL/TLS settings
  - Service accounts for GitHub Actions with limited hosting deploy roles
- Store Terraform state in shared backend (e.g., GCS bucket) and document workflow
- Add secrets management for environment variables (Firebase Remote Config or Secret Manager) instead of storing `.env.*` in git

### 4. Build & Environment Configuration

- Audit `.env.staging` and `.env.production`; migrate sensitive values to GitHub Secrets & Firebase via `firebase functions:config:set` or Secret Manager
- Update Vite build pipeline to read runtime config from environment variables supplied during CI (no checked-in secrets)
- Add integration tests post-build that hit Cloud Functions using stubbed AI/paid-service calls; no full E2E browser pass required in CI

### 5. CI/CD Workflow Hardening

- Split GitHub secrets: `FIREBASE_SERVICE_ACCOUNT_STAGING`, `FIREBASE_SERVICE_ACCOUNT_PROD`, Cloudflare API tokens, etc.
- Update `deploy-staging.yml` and `deploy-production.yml` to:
  - Use matrix caching for `npm ci`
  - Run unit, lint, type-check, and integration suites with all AI/third-party calls stubbed or mocked
  - Deploy via `FirebaseExtended/action-hosting-deploy` with environment-specific credentials
  - Post deployment, trigger synthetic check hitting `/health` endpoint on Functions
- Add manual approval gate (environment protection rule) for production deploys
- Enable PR check workflow to build preview channel and comment URL on PR

### 6. Monitoring, Logging & Rollback

- Enable Firebase Hosting logs export to Google Cloud Logging; wire to alerting (PagerDuty/email)
- Instrument frontend with Google Analytics 4 / alternative as required
- Define rollback procedure (re-deploy previous version or activate Hosting rollback command)
- Add runbook covering DNS changes, CI/CD secrets rotation, and incident response steps

### 7. Launch Readiness Checklist

- Domain ownership verified and SSL propagated
- CI pipelines green for 3 consecutive runs
- Smoke tests covering primary flows
- Documentation published (`README.md`, `DEPLOYMENT.md`) with step-by-step instructions
- Stakeholder sign-off before flipping production DNS to new frontend

## Roles & Ownership

| Workstream            | Primary  | Support  |
| --------------------- | -------- | -------- |
| Cloudflare/DNS        | PM       | Worker B |
| Firebase Hosting      | Worker B | PM       |
| Terraform IaC         | PM       | Worker B |
| Build & Env Config    | Worker B | PM       |
| CI/CD Workflows       | Worker B | PM       |
| Monitoring & Runbooks | PM       | Worker B |

## Open Considerations

1. Final production/staging domain names?
2. Preferred analytics/monitoring stack (GA4, Sentry, etc.)?
3. Do we require multi-region hosting or is single region acceptable?
4. Any compliance requirements (cookie consent, GDPR banners) before public launch?
