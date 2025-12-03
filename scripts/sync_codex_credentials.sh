#!/usr/bin/env bash
# Sync Codex CLI credentials from the host (source of truth) into the
# deployment seed directories so new/respawned containers pick up fresh tokens.

set -euo pipefail

SOURCE="${HOME}/.codex"
TARGETS=(
  "${CODEX_SYNC_ROOT:-/srv/job-finder}/codex/.codex"
  "${CODEX_SYNC_ROOT:-/srv/job-finder}/codex-seed/.codex"
)

if [[ ! -d "${SOURCE}" ]]; then
  echo "Source Codex directory not found at ${SOURCE}. Authenticate on the host first." >&2
  exit 1
fi

# Only the auth token should be shared; config/history stay machine-specific.
SOURCE_FILE="${SOURCE}/auth.json"
if [[ ! -f "${SOURCE_FILE}" ]]; then
  echo "Auth file not found at ${SOURCE_FILE}. Authenticate on the host first." >&2
  exit 1
fi

umask 077
for target in "${TARGETS[@]}"; do
  install -m 700 -d "${target}"
  install -m 600 "${SOURCE_FILE}" "${target}/auth.json"
done

echo "Synced Codex auth.json from ${SOURCE} to:"
printf ' - %s\n' "${TARGETS[@]}"
