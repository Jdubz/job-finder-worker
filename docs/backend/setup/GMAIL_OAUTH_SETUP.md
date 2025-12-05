> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-05

# Gmail OAuth Setup (API Server)

This guide enables Gmail polling on the API server while keeping the worker unchanged. Follow these steps exactly—missing config or env values will cause the Gmail ingest cron/endpoint to fail loudly.

## 1) Enable Gmail API and create OAuth client
- In the Google Cloud Console, enable **Gmail API** for your project.
- Create an **OAuth 2.0 Client ID** of type **Web application**.
- Authorized redirect URIs (include both):
  - `https://<your-domain>/gmail/oauth/callback`
  - `http://localhost:5173/gmail/oauth/callback` (for local dev)
- Scopes: `https://www.googleapis.com/auth/gmail.readonly` (we only read mail).

## 2) Required environment variables (API server)
- `GMAIL_OAUTH_CLIENT_ID` – client ID from the Google Console.
- `GMAIL_OAUTH_CLIENT_SECRET` – matching client secret.
- `GMAIL_TOKEN_KEY` – 32‑byte key (base64 or hex) for AES-256-GCM encryption of refresh tokens stored in SQLite.
- Optional reuse: `GOOGLE_OAUTH_CLIENT_ID` can still be present; Gmail routes prefer the dedicated vars above.

The server will throw if the client ID/secret or token key are missing when exchanging/refreshing tokens.

## 3) Create the gmail-ingest config (no defaults)
- Add a `job_finder_config` entry with id `gmail-ingest` via the admin Config UI or the config API.
- Required fields: `enabled`, `label`/`query`, `maxMessages`, `allowedSenders`/`allowedDomains`, `remoteSourceDefault`, `aiFallbackEnabled`, `defaultLabelOwner`.
- No defaults are seeded; cron/manual ingest will error if this config is absent or disabled.

## 4) Authorize inboxes (admin UI)
- Navigate to **Admin → Config → Gmail**.
- Save the ingest settings, then click **Authorize Gmail**. The UI fetches the client ID from `/api/gmail/oauth/client`; if it is missing the button errors instead of falling back silently.
- Complete Google consent; on return, the API stores encrypted tokens on the `users` row (`gmail_email`, `gmail_auth_json`) for the signed-in admin (or creates the user).
- The **Linked Inboxes** list shows connected accounts and provides **Revoke access**, which clears stored tokens for that mailbox.
- Multi-inbox is supported: repeat auth for each admin mailbox you want to poll. Ingest reads all users with Gmail tokens.

## 5) Scheduling
- Enable `gmailIngest` in `cron-config` if you want automated polling. Cron lives on the API server; no worker changes are needed.

## 6) Troubleshooting (fail-fast signals)
- "gmail-ingest config missing/disabled" → create or enable the config entry.
- "GMAIL_OAUTH_CLIENT_ID/SECRET are required" → set env vars and redeploy.
- "GMAIL_TOKEN_KEY is required" → set a 32-byte key; rotating requires re-auth to refresh tokens.

Keep secrets out of git; rely on your secrets manager for the env values.
