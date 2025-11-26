#!/usr/bin/env bash
set -euo pipefail

# Sets up personal-info in the validation database for testing.
# Run this after clone-prod-db.sh if personal-info is missing.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_PATH="$SCRIPT_DIR/volumes/sqlite/jobfinder.db"

if [[ ! -f "$DB_PATH" ]]; then
  echo "ERROR: Database not found at $DB_PATH" >&2
  echo "Run clone-prod-db.sh first." >&2
  exit 1
fi

# Check if personal-info already exists
EXISTING=$(sqlite3 "$DB_PATH" "SELECT id FROM job_finder_config WHERE id = 'personal-info';")
if [[ -n "$EXISTING" ]]; then
  echo "personal-info already exists in database."
  sqlite3 "$DB_PATH" "SELECT payload_json FROM job_finder_config WHERE id = 'personal-info';" | jq .
  exit 0
fi

# Insert personal-info with your actual data
# Edit these values to match your real info
PERSONAL_INFO_JSON=$(cat <<'EOF'
{
  "name": "Josh Wentworth",
  "email": "contact@joshwentworth.com",
  "phone": null,
  "location": "Portland, OR",
  "website": "https://joshwentworth.com",
  "linkedin": "https://www.linkedin.com/in/joshwentworth/",
  "github": "https://github.com/Jdubz",
  "summary": "Experienced Software Engineer with a strong background in building scalable systems and integrating complex APIs. Proficient in React, TypeScript, and Python, with a proven track record in developing robust automation solutions.",
  "accentColor": "#3B82F6",
  "avatar": "/assets/avatar.jpg",
  "logo": "/assets/logo.svg"
}
EOF
)

# Escape single quotes for SQLite
ESCAPED_JSON=$(echo "$PERSONAL_INFO_JSON" | sed "s/'/''/g")

sqlite3 "$DB_PATH" "INSERT INTO job_finder_config (id, payload_json, updated_at, name) VALUES ('personal-info', '$ESCAPED_JSON', datetime('now'), 'Personal Info');"

echo "personal-info inserted successfully:"
sqlite3 "$DB_PATH" "SELECT payload_json FROM job_finder_config WHERE id = 'personal-info';" | jq .
