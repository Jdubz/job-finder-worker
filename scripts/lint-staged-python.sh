#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
WORKER_DIR="$ROOT_DIR/job-finder-worker"
PYTHON_BIN=""

if [[ -x "$WORKER_DIR/venv/bin/python" ]]; then
  PYTHON_BIN="$WORKER_DIR/venv/bin/python"
else
  PYTHON_BIN="$(command -v python3 || true)"
fi

if [[ -z "$PYTHON_BIN" ]]; then
  echo "[lint] python3 not found; skipping python lint"
  exit 0
fi

# Collect staged python files within the worker
STAGED_FILES=$(git diff --cached --name-only -- '*.py' | grep '^job-finder-worker/' || true)
if [[ -z "$STAGED_FILES" ]]; then
  # Fall back to files changed against upstream if nothing staged
  UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || true)
  if [[ -n "$UPSTREAM" ]]; then
    STAGED_FILES=$(git diff --name-only "$UPSTREAM"...HEAD -- '*.py' | grep '^job-finder-worker/' || true)
  fi
fi

if [[ -z "$STAGED_FILES" ]]; then
  echo "[lint] No staged python files under job-finder-worker; skipping python lint"
  exit 0
fi

# Normalize paths relative to worker dir
pushd "$WORKER_DIR" >/dev/null
FILE_LIST=()
while IFS= read -r f; do
  # strip leading path component
  FILE_LIST+=("${f#job-finder-worker/}")
done <<< "$STAGED_FILES"

# Black (check only)
echo "[lint] black --check on staged python files"
"$PYTHON_BIN" -m black --check "${FILE_LIST[@]}"

# flake8
if "$PYTHON_BIN" -m flake8 --version >/dev/null 2>&1; then
  echo "[lint] flake8 on staged python files"
  "$PYTHON_BIN" -m flake8 "${FILE_LIST[@]}"
else
  echo "[lint] flake8 not installed; skipping"
fi

# mypy
if "$PYTHON_BIN" -m mypy --version >/dev/null 2>&1; then
  echo "[lint] mypy on staged python files"
  "$PYTHON_BIN" -m mypy --config-file mypy.ini "${FILE_LIST[@]}"
else
  echo "[lint] mypy not installed; skipping"
fi

popd >/dev/null
