# Security Policy

Job Finder is an actively developed monorepo that contains the frontend, API, worker, shared TypeScript types, infrastructure, and docs. We take reports of vulnerabilities seriously and ask that you follow the process below.

## Supported Branches

| Branch | Status |
| --- | --- |
| `main` | Supported / receives fixes |
| `staging` | Protected branch that feeds `main`; treated the same as `main` |

All other branches are considered experimental and may not receive security patches.

## Reporting a Vulnerability

1. **Do not** open a public GitHub issue describing the vulnerability.
2. Email `contact@joshwentworth.com` with:
   - A clear description of the issue and its impact
   - Steps (or proof of concept) to reproduce
   - The commit SHA or tag you tested against
   - Any suggested mitigations or patches, if available
3. We will acknowledge the report within 3 business days and provide status updates as the fix progresses.
4. Please allow us a reasonable window to remediate before publicly disclosing the vulnerability.

If you need to send encrypted details, mention that in your initial email and we will reply with a PGP key or secure channel.

## Handling Secrets & Credentials

- Never commit `.env` files, API keys, service account JSON, or other secrets to the repository.
- Use 1Password / secret managers for runtime keys. Local development should rely on the redacted `.env.example` files in each workspace.
- Cloud resources (Firebase, Mailgun, Cloudflare, etc.) must follow their respective Terms of Service; scraping credentials in the worker must remain scoped to personal use only.

## Dependencies & Tooling

- Keep Node.js, npm, and Python dependencies up to date (`npm audit`, `pip audit`, Dependabot, etc.).
- Review Husky hooks and GitHub Actions before disabling them; they provide lint/build gates that prevent known classes of issues from reaching `main`.

## Responsible Use

This project ships automated scraping tooling. Ensure your usage complies with applicable laws, site-specific Terms of Service, and privacy regulations. Do not use the worker to exfiltrate data, attack third parties, or otherwise act maliciously.

## Contact

`contact@joshwentworth.com` – security / maintainer contact for disclosure and coordination.
