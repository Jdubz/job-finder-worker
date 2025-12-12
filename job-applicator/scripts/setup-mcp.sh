#!/bin/bash
# Setup script for job-applicator MCP server
# This registers the MCP server with Claude CLI

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MCP_SERVER_DIR="$PROJECT_DIR/mcp-server"

echo "Setting up job-applicator MCP server..."

# Check if claude CLI is installed
if ! command -v claude &> /dev/null; then
    echo "Error: Claude CLI is not installed."
    echo "Please install it first: https://docs.anthropic.com/en/docs/claude-code"
    exit 1
fi

# Build MCP server if needed
if [ ! -f "$MCP_SERVER_DIR/dist/index.js" ]; then
    echo "Building MCP server..."
    cd "$MCP_SERVER_DIR"
    npm install
    npm run build
    cd "$PROJECT_DIR"
fi

# Check if already registered
if claude mcp list 2>/dev/null | grep -q "job-applicator"; then
    echo "MCP server 'job-applicator' is already registered."
    echo "To update, run: claude mcp remove job-applicator && $0"
    exit 0
fi

# Register the MCP server
echo "Registering MCP server with Claude CLI..."
claude mcp add job-applicator --scope user -- node "$MCP_SERVER_DIR/dist/index.js"

echo ""
echo "Setup complete! The job-applicator MCP server is now registered."
echo ""
echo "To verify, run: claude mcp list"
echo "To remove, run: claude mcp remove job-applicator"
