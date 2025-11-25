# Environment Parity Template

> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

Use this checklist to verify configuration alignment across environments (staging, production, etc.) before deployment or cutover.

## Frontend

| Item                   | Staging Value                          | Production Value                     | Notes                                                                                                   |
| ---------------------- | -------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Firebase Project ID    | `[project-id]`                         | `[project-id]`                       | Verify project ID matches deployment documentation.                                                     |
| Hosting Site           | `[site-staging]` (`.web.app`)          | `[site-production]` (`.web.app`)     | Ensure both hosts are accessible and configured correctly.                                               |
| Custom Domain          | `[staging-domain.example.com]`         | `[production-domain.example.com]`    | Verify DNS and proxy configuration (e.g., Cloudflare).                                                  |
| GitHub Environment     | `staging`                              | `production`                         | Confirm environments are provisioned with appropriate approvals matrix.                                  |
| GitHub Secrets         | `FIREBASE_SERVICE_ACCOUNT` (present)   | `FIREBASE_SERVICE_ACCOUNT` (present) | Verify secrets are uploaded and check rotation policy.                                                   |
| `.env` Files           | `apps/web/.env.staging` (configured)   | `.env.production` (configured)       | Validate environment-specific configuration values.                                                      |
| Analytics & Monitoring | Firebase Analytics (configured)        | Firebase Analytics (configured)      | Confirm instrumentation is in place.                                                                     |

## Backend (Cloud Functions)

| Item               | Staging                                                                 | Production                             | Notes                                                                |
| ------------------ | ----------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------- |
| Firebase Project   | `[project-id]`                                                          | `[project-id]`                         | Shared or separate projects depending on architecture.               |
| Functions Deployed | `[function-name]-staging`, `[function-name]-staging`                    | `[function-name]`, `[function-name]`   | Verify all required functions are deployed and functional.           |
| CI Workflows       | `deploy-staging.yml` (passing)                                          | `deploy-production.yml` (passing)      | Ensure workflows have required secrets and environment configuration. |
| Firestore DB       | `[database-name]-staging`                                               | `(default)` or `[database-name]`       | Verify correct database references in configuration.                 |
| Auth Claims Matrix | Configured per security requirements                                    | Configured per security requirements   | Validate authentication and authorization configuration.              |

## Worker (Python)

| Item              | Staging                                    | Production                              | Notes                                                     |
| ----------------- | ------------------------------------------ | --------------------------------------- | --------------------------------------------------------- |
| Deployment Target | Docker Compose staging stack               | Docker Compose prod stack               | Verify deployment configuration files are correct.        |
| Queue Smoke Tests | Completed successfully                     | Completed successfully                  | Run baseline tests to ensure queue processing works.      |
| Service Accounts  | `worker-staging@[project-id]`              | `worker-prod@[project-id]`              | Confirm credentials and secure secret storage.            |
| Monitoring/Alerts | Configured per monitoring requirements     | Configured per monitoring requirements  | Define and test alerting before production deployment.    |

## Shared Types

| Item                | Staging                              | Production                           | Notes                                         |
| ------------------- | ------------------------------------ | ------------------------------------ | --------------------------------------------- |
| Package Version     | `job-finder-shared-types@[version]`  | `job-finder-shared-types@[version]`  | Ensure version is consistent across services. |
| Type Sync in FE     | `package.json` locked to `^[version]`| `package.json` locked to `^[version]`| Verify workspace `package.json` is updated.   |
| Type Sync in BE     | `package.json` locked to `^[version]`| `package.json` locked to `^[version]`| Verify backend manifest is updated.           |
| Type Sync in Worker | `poetry.lock` or `requirements.txt`  | `poetry.lock` or `requirements.txt`  | Confirm Python worker uses generated schemas. |

## Infrastructure & Access

| Item                  | Staging                                      | Production                                   | Notes                                                                                               |
| --------------------- | -------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| DNS Configuration     | Records in place for staging subdomain       | Records in place for production domain       | Document manual configuration if DNS provider doesn't support IaC.                                  |
| SSL Certificates      | Managed via DNS provider or CDN              | Managed via DNS provider or CDN              | Verify certificates are valid and auto-renewing.                                                    |
| IAM Bindings          | Service account access for deploys (granted) | Service account access for deploys (granted) | Ensure proper permissions for deployment and runtime operations.                                    |
| Secrets Storage       | GitHub Secrets + Cloud Provider              | GitHub Secrets + Cloud Provider              | Establish centralized secret management strategy.                                                   |
| Monitoring Dashboards | Configured and accessible                    | Configured and accessible                    | Define dashboards and verify access prior to launch.                                                |

## How to Use This Template

1. **Copy this template** for each environment comparison (staging vs production, dev vs staging, etc.)
2. **Fill in values** for both environments in each row
3. **Add notes** specific to your configuration or any deviations
4. **Review regularly** especially before deployments or major changes
5. **Track completion** by checking off verified items (not included in this template - add as needed)

## Best Practices

- Verify parity before any production deployment
- Document any intentional differences between environments
- Automate parity checks where possible (scripts, IaC validation)
- Keep this checklist updated as infrastructure evolves
- Review and update after each deployment
