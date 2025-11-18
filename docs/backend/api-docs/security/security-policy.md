# Backend Security Policy

**Last Updated:** 2025-10-29  
**Owner:** Worker A (Backend Security Lead)

This policy covers the Job Finder backend service (`job-finder-BE`) including all Google Cloud Functions, Firestore resources, and CI/CD workflows that deploy them. Follow these standards to keep production data and infrastructure secure.

## Supported Deployments

| Environment | Branch Source | Support Level | Notes |
| ----------- | ------------- | ------------- | ----- |
| Production  | `main`        | Full support  | Actively maintained; security fixes deployed immediately. |
| Staging     | `staging`     | Full support  | Mirrors production; use for verification prior to release. |
| Legacy/<other> | Any other branch | Unsupported | Remove or merge into supported branches before applying fixes. |

## Reporting a Vulnerability

1. **Create a private GitHub Security Advisory** for `<OWNER>/<REPO>` (preferred).  
2. **Direct message Worker A and the PM** in Slack with the advisory link and high-level summary.  
3. If Slack is unavailable, email the PM using the address on file and include Worker A.  
4. Do not open public issues or PRs describing the vulnerability until remediation ships.

Provide the following details:

- Impacted components (Cloud Functions, Firestore collections, CI workflows, etc.)
- Exact reproduction steps, including request payloads and environment
- Severity assessment (CVSS if available) and potential data exposure
- Suggested mitigation or temporary guardrails

## Triage & Response Timeline

| Phase | SLA | Actions |
| ----- | --- | ------- |
| Acknowledgment | 24 hours | PM confirms receipt and assigns response owner. |
| Initial Assessment | 72 hours | Determine scope, affected data, and immediate mitigations. |
| Remediation | ≤ 14 days (critical) / ≤ 30 days (high/medium) | Implement fix, add regression tests, update docs. |
| Disclosure | After remediation | Coordinate messaging with PM; publish summary post if required. |

Escalate to the PM immediately if any SLA will be missed.

## Hardening Standards

- **Authentication & Authorization**: Enforce Firebase Auth + role checks on every HTTP endpoint (`GAP-SEC-AUTH-1`).  
- **Least Privilege**: Service accounts may read/write only required collections; review IAM quarterly.  
- **Secrets Management**: Store credentials in Google Secret Manager; never commit secrets to git.  
- **Dependency Hygiene**: Run `npm audit` weekly and during every release; patch critical issues within 48 hours.  
- **Input Validation**: Validate payloads with shared schema types and reject malformed requests.  
- **Logging & Monitoring**: Send structured logs to Cloud Logging; enable error alerts via App Monitor dashboards.  
- **CI/CD Safeguards**: Require tests and security scans (Bandit, npm audit) before deploying; production deploys must be manually approved by the PM.

## Security Monitoring

- **Runtime Alerts**: App Monitor dashboards must include error rate, auth failure, and latency alerts.  
- **Rule Verification**: Follow `job-finder-BE/docs/security/index-verification.md` after every rules change.  
- **Incident Log**: Record post-incident summaries in `docs/security/` with timestamped filenames.

## Incident Response Checklist

- [ ] Contain exploit path (disable function, revoke credentials, etc.).  
- [ ] Rotate impacted secrets through Secret Manager.  
- [ ] Verify Firestore integrity and run staging parity checks.  
- [ ] Add regression tests or monitoring to prevent recurrence.  
- [ ] Update relevant runbooks and communicate resolution to stakeholders.

## Change Log

- **2025-10-29** – Security policy migrated from legacy `SECURITY.md`, updated to reflect backend ownership and GitHub Security Advisory workflow.
