> Status: Active
> Owner: @jdubz
> Last Updated: 2025-12-02

# Codex credential sync (host → seed)

The host machine always has the freshest Codex tokens. Run the helper script below to mirror those credentials into the seed directories that new containers use on startup.

## How to sync

```bash
# from repo root on the host
./scripts/sync_codex_credentials.sh
```

What it does:
- Copies only `~/.codex/auth.json` into `/srv/job-finder/codex/.codex` and `/srv/job-finder/codex-seed/.codex`.
- Leaves config/history in the seeds untouched so each machine/container keeps its own state.

## Automation option (cron)

Add a cron entry on the host (runs daily at 07:05):

```cron
5 7 * * * /home/jdubz/Development/job-finder-bot/scripts/sync_codex_credentials.sh >> /var/log/codex-sync.log 2>&1
```

Adjust the path/time as needed.

## Automation option (systemd watch) — recommended

This keeps seeds in sync within seconds of any change to `~/.codex/auth.json`.

```bash
# from repo root on the host
mkdir -p ~/.config/systemd/user
cp infra/systemd/codex-sync.service infra/systemd/codex-sync.path ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now codex-sync.path
# optional: run once immediately
systemctl --user start codex-sync.service
```

The path unit watches `~/.codex/auth.json`, `config.toml`, and `history.jsonl`; any change triggers the sync service which calls `scripts/sync_codex_credentials.sh`.
The path unit watches `~/.codex/auth.json` only; any change triggers the sync service which calls `scripts/sync_codex_credentials.sh`.

## Why this matters

The API/worker containers seed their Codex CLI config from `/srv/job-finder/codex-seed/.codex` when they start. Keeping that seed in sync with the host prevents “AI generation failed… token already used/expired” errors that happen when tokens drift.
