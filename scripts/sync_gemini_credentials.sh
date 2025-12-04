#!/usr/bin/env bash
# Sync Gemini CLI credentials from the host (source of truth) into the
# deployment seed directories so new/respawned containers pick up fresh tokens.

set -euo pipefail

SOURCE="${HOME}/.gemini"
TARGETS=(
  "${GEMINI_SYNC_ROOT:-/srv/job-finder}/gemini/.gemini"
  "${GEMINI_SYNC_ROOT:-/srv/job-finder}/gemini-seed/.gemini"
)

if [[ ! -d "${SOURCE}" ]]; then
  echo "Source Gemini directory not found at ${SOURCE}. Authenticate on the host first (gemini auth login)." >&2
  exit 1
fi

SOURCE_FILE="${SOURCE}/oauth_creds.json"
if [[ ! -f "${SOURCE_FILE}" ]]; then
  echo "Auth file not found at ${SOURCE_FILE}. Run 'gemini auth login' on the host to create it." >&2
  exit 1
fi

umask 077
for target in "${TARGETS[@]}"; do
  install -m 700 -d "${target}"
  install -m 600 "${SOURCE_FILE}" "${target}/oauth_creds.json"
done

echo "Synced Gemini oauth_creds.json from ${SOURCE} to:"
printf ' - %s\n' "${TARGETS[@]}"
