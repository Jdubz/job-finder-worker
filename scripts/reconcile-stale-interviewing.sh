#!/usr/bin/env bash
# Reconcile stale `interviewing` job_matches that have gone silent or were
# explicitly closed. Reads rows to flip from a CSV input file so the personal
# application history never lands in version control.
#
# CSV format (header required, fields are pipe-delimited to avoid quoting):
#   match_id|expected_from|target_status|note
# Example row:
#   9939dd38-...|interviewing|denied|Dropbox paused hiring (recruiter, 2026-05-12)
#
# The input file path defaults to ./reconcile-input.csv and is gitignored
# (see .gitignore: scripts/reconcile-*.csv).
#
# Each transition is guarded: a row is only applied when the match's current
# status equals `expected_from`. If the match has moved on (e.g. someone
# manually flipped it to `applied`), the row is skipped — protecting newer
# state from being clobbered by an old reconciliation file.
#
# Every applied transition writes both:
#   - job_matches.status (with status_note, status_updated_by='reconciliation-script')
#   - application_status_history row (changed_by='reconciliation-script')
#
# Usage:
#   ./scripts/reconcile-stale-interviewing.sh [path/to/input.csv]
#   DRY_RUN=1 ./scripts/reconcile-stale-interviewing.sh   # preview only
#   JF_DB=/path/to/jobfinder.db ./scripts/reconcile-stale-interviewing.sh

set -euo pipefail

DB="${JF_DB:-/srv/job-finder/data/jobfinder.db}"
INPUT="${1:-./reconcile-input.csv}"
NOW="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
DRY_RUN="${DRY_RUN:-0}"

if [[ ! -f "$DB" ]]; then
  echo "DB not found: $DB" >&2
  exit 1
fi

if [[ ! -f "$INPUT" ]]; then
  cat <<EOF >&2
Input file not found: $INPUT

Create a pipe-delimited file (one row per transition) with this header:
  match_id|expected_from|target_status|note

The file is gitignored. Re-run with the path as the first argument or place
it at the default location and re-run.
EOF
  exit 1
fi

apply_one() {
  local match_id="$1" expected_from="$2" target="$3" note="$4"
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
  if [[ "$current" != "$expected_from" ]]; then
    echo "SKIP $match_id — current=$current, expected=$expected_from (state moved on)"
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
 WHERE id='$match_id' AND status='$expected_from';
INSERT INTO application_status_history
   (id, job_match_id, from_status, to_status, changed_by, application_email_id, note, created_at)
VALUES
   ('$history_id', '$match_id', '$current', '$target', 'reconciliation-script', NULL,
    '$(printf '%s' "$note" | sed "s/'/''/g")', '$NOW');
COMMIT;
SQL
}

if [[ "$DRY_RUN" == "1" ]]; then
  echo "[DRY RUN] would reconcile rows from $INPUT into $DB:"
fi

# Skip header line, then iterate rows.
tail -n +2 "$INPUT" | while IFS='|' read -r match_id expected_from target note; do
  match_id="${match_id// /}"
  expected_from="${expected_from// /}"
  target="${target// /}"
  [[ -z "$match_id" ]] && continue
  [[ "$match_id" == \#* ]] && continue
  apply_one "$match_id" "$expected_from" "$target" "$note"
done

echo "Done."
