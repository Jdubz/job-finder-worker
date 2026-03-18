#!/usr/bin/env bash
# resolve-models.sh — Verify the Anthropic model ID before LiteLLM starts.
#
# Makes a minimal test call to the configured Claude model via the Anthropic API.
# If the model ID is invalid/retired/inaccessible, probes known Claude model IDs
# (newest first, Sonnet then Haiku) to find one that works, then patches
# litellm-config.yaml.
#
# This prevents silent fallback to Gemini when Anthropic retires model versions
# or when the API key lacks access to the configured model.

set -euo pipefail

CONFIG_FILE="${1:-/app/config.yaml}"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"

if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "[resolve-models] ANTHROPIC_API_KEY not set, skipping model resolution"
  exit 0
fi

# Extract current model ID from config (portable — no PCRE dependency)
CURRENT_MODEL=$(sed -n 's/.*model: anthropic\/\([^ ]*\).*/\1/p' "$CONFIG_FILE" | head -1)
if [ -z "$CURRENT_MODEL" ]; then
  echo "[resolve-models] No anthropic model found in config, skipping"
  exit 0
fi

echo "[resolve-models] Testing model: anthropic/$CURRENT_MODEL"

# Test the configured model with a minimal request
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
ERROR_TYPE=$(echo "$TEST_RESPONSE" | python -c "
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

echo "[resolve-models] WARNING: Model anthropic/$CURRENT_MODEL is invalid/retired/inaccessible"
echo "[resolve-models] Probing known Claude model IDs..."

# Probe Claude models from newest to oldest: Sonnet (preferred for quality),
# then Haiku (acceptable fallback). Generalized names (no date suffix) resolve
# to the latest patch in that family.
for CANDIDATE in \
  "claude-sonnet-4-7" \
  "claude-sonnet-4-6" \
  "claude-sonnet-4-5" \
  "claude-sonnet-4-0" \
  "claude-haiku-4-5" \
  "claude-haiku-4-5-20251001"; do

  PROBE=$(curl -sf --max-time 10 \
    https://api.anthropic.com/v1/messages \
    -H "Content-Type: application/json" \
    -H "x-api-key: $ANTHROPIC_API_KEY" \
    -H "anthropic-version: 2023-06-01" \
    -d "{\"model\":\"$CANDIDATE\",\"max_tokens\":1,\"messages\":[{\"role\":\"user\",\"content\":\".\"}]}" 2>/dev/null || echo "")

  PROBE_TYPE=$(echo "$PROBE" | python -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print('ok' if 'content' in d or d.get('type') == 'message' else d.get('error',{}).get('type','unknown'))
except:
    print('error')
" 2>/dev/null || echo "error")

  if [ "$PROBE_TYPE" = "ok" ]; then
    echo "[resolve-models] Found working model: anthropic/$CANDIDATE"
    sed -i "s|model: anthropic/$CURRENT_MODEL|model: anthropic/$CANDIDATE|" "$CONFIG_FILE"
    echo "[resolve-models] Config updated: anthropic/$CURRENT_MODEL -> anthropic/$CANDIDATE"
    exit 0
  fi
  echo "[resolve-models]   $CANDIDATE: $PROBE_TYPE"
done

echo "[resolve-models] ERROR: No working Claude model found. Claude will be unavailable."
exit 1
