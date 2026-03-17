#!/usr/bin/env bash
# resolve-models.sh — Verify the Anthropic model ID before LiteLLM starts.
#
# Makes a minimal test call to the configured Claude model via the Anthropic API.
# If the model ID is invalid/retired, probes known generalized Sonnet model IDs
# (newest first) to find one that works, then patches litellm-config.yaml.
#
# This prevents silent fallback to Gemini when Anthropic retires model versions.
# Falls back gracefully if the API is unreachable or the key is an OAuth token
# that can't make direct API calls (LiteLLM handles OAuth auth internally).

set -euo pipefail

CONFIG_FILE="${1:-/app/config.yaml}"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "[resolve-models] ANTHROPIC_API_KEY not set, skipping model resolution"
  exit 0
fi

# Extract current model ID from config
CURRENT_MODEL=$(grep -oP '(?<=model: anthropic/)[^\s]+' "$CONFIG_FILE" | head -1 || echo "")
if [ -z "$CURRENT_MODEL" ]; then
  echo "[resolve-models] No anthropic model found in config, skipping"
  exit 0
fi

echo "[resolve-models] Testing model: anthropic/$CURRENT_MODEL"

# Detect OAuth keys — these can't make direct API calls; LiteLLM handles auth internally.
# For OAuth keys, we can only verify models after LiteLLM starts (via /health endpoint).
if [[ "$ANTHROPIC_API_KEY" == sk-ant-oat* ]]; then
  echo "[resolve-models] OAuth key detected — model verification will run post-startup via /health"
  exit 0
fi

# Test the configured model with a minimal request (standard API keys only)
TEST_RESPONSE=$(curl -sf --max-time 15 \
  https://api.anthropic.com/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d "{\"model\":\"$CURRENT_MODEL\",\"max_tokens\":1,\"messages\":[{\"role\":\"user\",\"content\":\".\"}]}" 2>/dev/null || echo "")

if [ -z "$TEST_RESPONSE" ]; then
  echo "[resolve-models] Anthropic API unreachable, using existing config"
  exit 0
fi

# Check response type
ERROR_TYPE=$(echo "$TEST_RESPONSE" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    if 'content' in d or d.get('type') == 'message':
        print('ok')
    elif d.get('error', {}).get('type') in ('invalid_request_error', 'not_found_error'):
        print('invalid_model')
    else:
        print('other:' + d.get('error', {}).get('type', 'unknown'))
except:
    print('parse_error')
" 2>/dev/null || echo "parse_error")

if [ "$ERROR_TYPE" = "ok" ]; then
  echo "[resolve-models] Model verified: anthropic/$CURRENT_MODEL"
  exit 0
fi

if [ "$ERROR_TYPE" != "invalid_model" ]; then
  echo "[resolve-models] Unexpected response ($ERROR_TYPE), using existing config"
  exit 0
fi

echo "[resolve-models] WARNING: Model anthropic/$CURRENT_MODEL is invalid/retired"
echo "[resolve-models] Probing known Sonnet model IDs..."

# Probe generalized Sonnet names from newest to oldest.
# These follow Anthropic's naming convention: claude-sonnet-{major}-{minor}
for CANDIDATE in \
  "claude-sonnet-4-7" \
  "claude-sonnet-4-6" \
  "claude-sonnet-4-5" \
  "claude-sonnet-4-0"; do

  PROBE=$(curl -sf --max-time 10 \
    https://api.anthropic.com/v1/messages \
    -H "Content-Type: application/json" \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -d "{\"model\":\"$CANDIDATE\",\"max_tokens\":1,\"messages\":[{\"role\":\"user\",\"content\":\".\"}]}" 2>/dev/null || echo "")

  PROBE_TYPE=$(echo "$PROBE" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print('ok' if 'content' in d or d.get('type') == 'message' else d.get('error',{}).get('type','unknown'))
except:
    print('error')
" 2>/dev/null || echo "error")

  if [ "$PROBE_TYPE" = "ok" ]; then
    echo "[resolve-models] Found working model: anthropic/$CANDIDATE"
    sed -i "s|model: anthropic/.*|model: anthropic/$CANDIDATE|" "$CONFIG_FILE"
    echo "[resolve-models] Config updated: anthropic/$CURRENT_MODEL -> anthropic/$CANDIDATE"
    exit 0
  fi
  echo "[resolve-models]   $CANDIDATE: $PROBE_TYPE"
done

echo "[resolve-models] ERROR: No working Sonnet model found. Claude will be unavailable."
exit 0
