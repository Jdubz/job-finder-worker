#!/bin/bash
# Simple log rotation for worker logs. Keeps files small and prunes old archives.

set -euo pipefail

LOG_DIR=${LOG_DIR:-/app/logs}
MAX_BYTES=${MAX_BYTES:-104857600} # 100 MB
RETENTION_DAYS=${RETENTION_DAYS:-7}

# Rotate oversized logs
for f in "$LOG_DIR"/*.log; do
  [[ -f "$f" ]] || continue
  size=$(stat -c%s "$f" 2>/dev/null || echo 0)
  if (( size > MAX_BYTES )); then
    ts=$(date +%Y%m%d-%H%M%S)
    rotated="$f.$ts"
    mv "$f" "$rotated"
    gzip -9 "$rotated"
    : > "$f"  # truncate current log
  fi
done

# Prune old rotated logs
find "$LOG_DIR" -type f -name "*.log.*.gz" -mtime +$RETENTION_DAYS -delete || true
