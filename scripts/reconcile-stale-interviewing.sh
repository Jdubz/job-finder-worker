#!/usr/bin/env bash
# Reconcile stale `interviewing` job_matches that have gone silent or were explicitly closed.
#
# Source of truth is Gmail history (see ~/Development/llm-prep/ docs for context).
# As of 2026-05-13 the following matches are stuck in `interviewing` but no longer live:
#
#   - Dropbox: Full Stack SWE, Dash Experiences — Dropbox paused hiring (Camila, 2026-05-12)
#   - Rula: Senior SWE Remote — silent since the interview on 2026-02-27 (~10 weeks)
#   - OpenLoop Health: Senior Solutions Engineer — silent since 2026-04-22 (~3 weeks)
#
# Transitions them to `denied` and records the change in application_status_history.
# Idempotent: re-running has no effect once the rows are already in target state.

set -euo pipefail

DB="${JF_DB:-/srv/job-finder/data/jobfinder.db}"
NOW="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
DRY_RUN="${DRY_RUN:-0}"

if [[ ! -f "$DB" ]]; then
  echo "DB not found: $DB" >&2
  exit 1
fi

# Reconciliation table: match_id, target_status, note
read -r -d '' ROWS <<'EOF' || true
9939dd38-0959-462c-a592-04abde0ff7a2|denied|auto-reconciled 2026-05-13: Dropbox paused hiring for the role (Camila, 2026-05-12)
858282eb-fee7-413e-8ca4-6c34768a7840|denied|auto-reconciled 2026-05-13: no response since interview on 2026-02-27
6043396a-edf2-42c4-8a0b-77e737934246|denied|auto-reconciled 2026-05-13: no response since 2026-04-22
EOF

apply_one() {
  local match_id="$1" target="$2" note="$3"
  local current
  current="$(sqlite3 "$DB" "SELECT status FROM job_matches WHERE id='$match_id';")"
  if [[ -z "$current" ]]; then
    echo "SKIP $match_id — not found"
    return
  fi
  if [[ "$current" == "$target" ]]; then
    echo "SKIP $match_id — already $target"
    return
  fi

  local history_id
  history_id="$(uuidgen)"

  echo "FLIP $match_id: $current -> $target"

  if [[ "$DRY_RUN" == "1" ]]; then
    return
  fi

  sqlite3 "$DB" <<SQL
BEGIN;
UPDATE job_matches
   SET status='$target',
       status_note='$(printf '%s' "$note" | sed "s/'/''/g")',
       status_updated_by='reconciliation-script',
       updated_at='$NOW'
 WHERE id='$match_id';
INSERT INTO application_status_history
   (id, job_match_id, from_status, to_status, changed_by, application_email_id, note, created_at)
VALUES
   ('$history_id', '$match_id', '$current', '$target', 'email_tracker', NULL,
    '$(printf '%s' "$note" | sed "s/'/''/g")', '$NOW');
COMMIT;
SQL
}

if [[ "$DRY_RUN" == "1" ]]; then
  echo "[DRY RUN] would reconcile the following matches in $DB:"
fi

while IFS='|' read -r match_id target note; do
  [[ -z "$match_id" ]] && continue
  apply_one "$match_id" "$target" "$note"
done <<< "$ROWS"

echo "Done."
