#!/bin/sh
set -e

# Fix ownership of mounted volumes (runs as root initially)
# The node user (uid 1000) needs write access to data directories
chown -R node:node /data/artifacts 2>/dev/null || true
chown -R node:node /data/sqlite 2>/dev/null || true

# Drop privileges and run as node user
exec gosu node "$@"
