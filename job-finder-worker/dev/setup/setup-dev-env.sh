#!/bin/bash
#
# Setup local development environment
# Creates directory structure and clones production database
#
# Usage:
#   ./dev/setup/setup-dev-env.sh [--prod-db-path /path/to/prod/jobfinder.db]
#   ./dev/setup/setup-dev-env.sh --help
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Go up two levels: dev/setup -> dev -> worker root
WORKER_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
DEV_DIR="$WORKER_DIR/.dev"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default production DB path (adjust for your setup)
# Common locations:
#   - /srv/job-finder/data/jobfinder.db (production server)
#   - ../infra/sqlite/jobfinder.db (local monorepo)
#   - ~/job-finder-prod-backup/jobfinder.db (backup copy)
PROD_DB_PATH="${PROD_DB_PATH:-}"

usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Setup local development environment for job-finder-worker"
    echo ""
    echo "Options:"
    echo "  --prod-db-path PATH   Path to production SQLite database to clone"
    echo "  --scp USER@HOST:PATH  SCP command to fetch prod DB from remote server"
    echo "  --skip-db             Skip database cloning (just create directories)"
    echo "  --clean               Remove existing .dev directory before setup"
    echo "  --help                Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  PROD_DB_PATH          Default path to production database"
    echo ""
    echo "Examples:"
    echo "  $0 --prod-db-path /srv/job-finder/data/jobfinder.db"
    echo "  $0 --scp user@prod-server:/srv/job-finder/data/jobfinder.db"
    echo "  $0 --skip-db"
}

# Parse arguments
SKIP_DB=false
CLEAN=false
SCP_SOURCE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --prod-db-path)
            PROD_DB_PATH="$2"
            shift 2
            ;;
        --scp)
            SCP_SOURCE="$2"
            shift 2
            ;;
        --skip-db)
            SKIP_DB=true
            shift
            ;;
        --clean)
            CLEAN=true
            shift
            ;;
        --help)
            usage
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            usage
            exit 1
            ;;
    esac
done

echo -e "${CYAN}=========================================${NC}"
echo -e "${CYAN}Job Finder Worker - Dev Environment Setup${NC}"
echo -e "${CYAN}=========================================${NC}"
echo ""

# Clean existing .dev directory if requested
if [ "$CLEAN" = true ] && [ -d "$DEV_DIR" ]; then
    echo -e "${YELLOW}Cleaning existing .dev directory...${NC}"
    rm -rf "$DEV_DIR"
fi

# Create directory structure
echo -e "${CYAN}Creating directory structure...${NC}"
mkdir -p "$DEV_DIR/data"
mkdir -p "$DEV_DIR/config"
mkdir -p "$DEV_DIR/logs"
mkdir -p "$DEV_DIR/worker-data"

echo -e "${GREEN}  Created .dev/data/${NC}"
echo -e "${GREEN}  Created .dev/config/${NC}"
echo -e "${GREEN}  Created .dev/logs/${NC}"
echo -e "${GREEN}  Created .dev/worker-data/${NC}"
echo ""

# Handle database cloning
if [ "$SKIP_DB" = true ]; then
    echo -e "${YELLOW}Skipping database clone (--skip-db)${NC}"
    echo ""
elif [ -n "$SCP_SOURCE" ]; then
    # Clone via SCP
    echo -e "${CYAN}Cloning production database via SCP...${NC}"
    echo -e "${YELLOW}Source: $SCP_SOURCE${NC}"

    scp "$SCP_SOURCE" "$DEV_DIR/data/jobfinder.db"

    if [ -f "$DEV_DIR/data/jobfinder.db" ]; then
        echo -e "${GREEN}Successfully cloned database${NC}"
        DB_SIZE=$(du -h "$DEV_DIR/data/jobfinder.db" | cut -f1)
        echo -e "${GREEN}  Size: $DB_SIZE${NC}"
    else
        echo -e "${RED}Failed to clone database${NC}"
        exit 1
    fi
    echo ""
elif [ -n "$PROD_DB_PATH" ] && [ -f "$PROD_DB_PATH" ]; then
    # Clone from local path
    echo -e "${CYAN}Cloning production database...${NC}"
    echo -e "${YELLOW}Source: $PROD_DB_PATH${NC}"

    cp "$PROD_DB_PATH" "$DEV_DIR/data/jobfinder.db"

    if [ -f "$DEV_DIR/data/jobfinder.db" ]; then
        echo -e "${GREEN}Successfully cloned database${NC}"
        DB_SIZE=$(du -h "$DEV_DIR/data/jobfinder.db" | cut -f1)
        echo -e "${GREEN}  Size: $DB_SIZE${NC}"
    else
        echo -e "${RED}Failed to clone database${NC}"
        exit 1
    fi
    echo ""
else
    echo -e "${YELLOW}No production database specified.${NC}"
    echo -e "${YELLOW}Use one of these options:${NC}"
    echo -e "  --prod-db-path /path/to/jobfinder.db"
    echo -e "  --scp user@host:/path/to/jobfinder.db"
    echo -e "  PROD_DB_PATH=/path/to/db $0"
    echo ""
    echo -e "${YELLOW}Creating empty database placeholder...${NC}"
    touch "$DEV_DIR/data/.gitkeep"
    echo ""
fi

# Copy default config if it exists
if [ -f "$WORKER_DIR/config/logging.yaml" ]; then
    echo -e "${CYAN}Copying default config files...${NC}"
    cp "$WORKER_DIR/config/logging.yaml" "$DEV_DIR/config/" 2>/dev/null || true
    echo -e "${GREEN}  Copied logging.yaml${NC}"
fi

# Create .env file if it doesn't exist
if [ ! -f "$WORKER_DIR/.env" ]; then
    if [ -f "$WORKER_DIR/.env.example" ]; then
        echo -e "${CYAN}Creating .env from .env.example...${NC}"
        cp "$WORKER_DIR/.env.example" "$WORKER_DIR/.env"
        echo -e "${YELLOW}  Please update .env with your API keys${NC}"
    else
        echo -e "${YELLOW}No .env file found. Create one with your API keys.${NC}"
    fi
fi

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Dev environment setup complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo -e "Next steps:"
echo -e "  1. Ensure .env has your API keys (ANTHROPIC_API_KEY or OPENAI_API_KEY)"
echo -e "  2. Build dev image:    ${CYAN}make dev-build${NC}"
echo -e "  3. Start containers:   ${CYAN}make dev-up${NC}"
echo -e "  4. Watch logs:         ${CYAN}make dev-logs${NC}"
echo -e "  5. Test queue:         ${CYAN}make dev-test-status${NC}"
echo ""

# Show database info if cloned
if [ -f "$DEV_DIR/data/jobfinder.db" ]; then
    echo -e "Database info:"
    sqlite3 "$DEV_DIR/data/jobfinder.db" "SELECT 'Tables: ' || COUNT(*) FROM sqlite_master WHERE type='table';" 2>/dev/null || true
    sqlite3 "$DEV_DIR/data/jobfinder.db" "SELECT 'Queue items: ' || COUNT(*) FROM job_queue;" 2>/dev/null || true
    sqlite3 "$DEV_DIR/data/jobfinder.db" "SELECT 'Job matches: ' || COUNT(*) FROM job_matches;" 2>/dev/null || true
    sqlite3 "$DEV_DIR/data/jobfinder.db" "SELECT 'Companies: ' || COUNT(*) FROM companies;" 2>/dev/null || true
    echo ""
fi
