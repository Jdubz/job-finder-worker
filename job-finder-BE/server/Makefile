# Job Finder API Server Makefile
.PHONY: help install dev test lint clean \
	dev-setup dev-clone-db dev-clone-db-scp dev-build dev-up dev-up-hotreload \
	dev-down dev-restart dev-logs dev-shell dev-sqlite \
	dev-validate dev-health dev-clean dev-clean-all dev-quick

NPM := npm
API_PORT := 18080
PROFILE := prod

CYAN := \033[0;36m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
RESET := \033[0m

.DEFAULT_GOAL := help

help: ## Show available commands
	@echo "$(CYAN)Job Finder API Server - Node.js Application$(RESET)"
	@echo ""
	@echo "$(CYAN)Local Development:$(RESET)"
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / && !/^dev-/ {printf "  $(CYAN)%-18s$(RESET) %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo "$(CYAN)Docker Development:$(RESET)"
	@awk 'BEGIN {FS = ":.*?## "} /^dev-[a-zA-Z_-]+:.*?## / {printf "  $(CYAN)%-18s$(RESET) %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# =============================================================================
# Local Development (without Docker)
# =============================================================================

install: ## Install dependencies
	@echo "$(CYAN)Installing dependencies...$(RESET)"
	@$(NPM) install
	@echo "$(GREEN)✓ Dependencies installed$(RESET)"

dev: ## Start server in development mode (local)
	@echo "$(GREEN)Starting API server (development mode)...$(RESET)"
	@$(NPM) run dev

build: ## Build TypeScript
	@echo "$(CYAN)Building TypeScript...$(RESET)"
	@$(NPM) run build
	@echo "$(GREEN)✓ Build complete$(RESET)"

test: ## Run tests
	@echo "$(CYAN)Running tests...$(RESET)"
	@$(NPM) test

lint: ## Run linter
	@echo "$(CYAN)Running linter...$(RESET)"
	@$(NPM) run lint

clean: ## Clean build artifacts
	@echo "$(CYAN)Cleaning up...$(RESET)"
	@rm -rf dist coverage .tsbuildinfo
	@echo "$(GREEN)✓ Cleaned up$(RESET)"

# =============================================================================
# Docker Development Workflow (Production-like environment)
# =============================================================================

dev-setup: ## Setup dev environment (creates .dev/ directories)
	@echo "$(CYAN)Setting up dev environment...$(RESET)"
	@mkdir -p .dev/data .dev/artifacts .dev/logs .dev/output
	@if [ ! -f .env.dev ]; then \
		echo "# Development environment" > .env.dev; \
		echo "API_PORT=18080" >> .env.dev; \
		echo "GENERATOR_BYPASS_TOKEN=dev-token-change-me" >> .env.dev; \
		echo "$(YELLOW)Created .env.dev - please update with your settings$(RESET)"; \
	fi
	@echo "$(GREEN)✓ Dev environment ready!$(RESET)"
	@echo "$(YELLOW)Run 'make dev-clone-db' to clone production database$(RESET)"

dev-clone-db: ## Clone production database (PROD_DB=/path/to/db)
	@echo "$(CYAN)Cloning production database...$(RESET)"
	@if [ -z "$(PROD_DB)" ]; then \
		echo "$(YELLOW)Usage: make dev-clone-db PROD_DB=/path/to/jobfinder.db$(RESET)"; \
		echo ""; \
		echo "Example paths:"; \
		echo "  Local:  make dev-clone-db PROD_DB=../../infra/sqlite/jobfinder.db"; \
		echo "  Server: make dev-clone-db-scp SCP_SRC=user@host:/srv/job-finder/data/jobfinder.db"; \
		exit 1; \
	fi
	@mkdir -p .dev/data
	@cp "$(PROD_DB)" .dev/data/jobfinder.db
	@cp "$(PROD_DB)-wal" .dev/data/jobfinder.db-wal 2>/dev/null || true
	@cp "$(PROD_DB)-shm" .dev/data/jobfinder.db-shm 2>/dev/null || true
	@chmod 600 .dev/data/jobfinder.db*
	@echo "$(GREEN)✓ Database cloned to .dev/data/jobfinder.db$(RESET)"

dev-clone-db-scp: ## Clone production database via SCP (SCP_SRC=user@host:/path)
	@echo "$(CYAN)Cloning production database via SCP...$(RESET)"
	@if [ -z "$(SCP_SRC)" ]; then \
		echo "$(YELLOW)Usage: make dev-clone-db-scp SCP_SRC=user@host:/path/to/jobfinder.db$(RESET)"; \
		exit 1; \
	fi
	@mkdir -p .dev/data
	@scp "$(SCP_SRC)" .dev/data/jobfinder.db
	@scp "$(SCP_SRC)-wal" .dev/data/jobfinder.db-wal 2>/dev/null || true
	@scp "$(SCP_SRC)-shm" .dev/data/jobfinder.db-shm 2>/dev/null || true
	@chmod 600 .dev/data/jobfinder.db*
	@echo "$(GREEN)✓ Database cloned to .dev/data/jobfinder.db$(RESET)"

# Docker commands
dev-build: ## Build dev Docker image
	@echo "$(CYAN)Building dev Docker image...$(RESET)"
	@docker compose -f docker-compose.dev.yml --profile $(PROFILE) build
	@echo "$(GREEN)✓ Build complete!$(RESET)"

dev-up: ## Start dev containers (detached, prod image)
	@echo "$(CYAN)Starting dev containers...$(RESET)"
	@docker compose -f docker-compose.dev.yml --profile prod up -d
	@echo "$(GREEN)✓ Containers started!$(RESET)"
	@echo "API: http://localhost:$(API_PORT)/healthz"
	@echo "Logs: make dev-logs"

dev-up-hotreload: ## Start dev containers with hot reload
	@echo "$(CYAN)Starting dev containers (hot reload)...$(RESET)"
	@docker compose -f docker-compose.dev.yml --profile hotreload up -d
	@echo "$(GREEN)✓ Containers started with hot reload!$(RESET)"
	@echo "API: http://localhost:$(API_PORT)/healthz"
	@echo "Logs: make dev-logs"

dev-down: ## Stop dev containers
	@echo "$(YELLOW)Stopping dev containers...$(RESET)"
	@docker compose -f docker-compose.dev.yml --profile prod --profile hotreload down
	@echo "$(GREEN)✓ Containers stopped$(RESET)"

dev-restart: ## Restart dev API container
	@echo "$(YELLOW)Restarting API...$(RESET)"
	@docker compose -f docker-compose.dev.yml --profile prod restart api 2>/dev/null || \
		docker compose -f docker-compose.dev.yml --profile hotreload restart api-hotreload
	@echo "$(GREEN)✓ API restarted$(RESET)"

dev-logs: ## Tail dev API logs
	@docker compose -f docker-compose.dev.yml --profile prod logs -f api 2>/dev/null || \
		docker compose -f docker-compose.dev.yml --profile hotreload logs -f api-hotreload

dev-shell: ## Open shell in API container
	@docker compose -f docker-compose.dev.yml --profile prod exec api bash 2>/dev/null || \
		docker compose -f docker-compose.dev.yml --profile hotreload exec api-hotreload bash

dev-sqlite: ## Open sqlite CLI for dev database
	@sqlite3 .dev/data/jobfinder.db

dev-health: ## Check API health
	@echo "$(CYAN)Checking API health...$(RESET)"
	@curl -s "http://localhost:$(API_PORT)/healthz" | jq . || echo "$(RED)API not responding$(RESET)"

# Testing
dev-validate: ## Run generator test
	@echo "$(CYAN)Running generator test...$(RESET)"
	@if [ ! -f dev/sample-request.json ]; then \
		echo "$(RED)Missing dev/sample-request.json$(RESET)"; \
		exit 1; \
	fi
	@AUTH_TOKEN=$$(grep GENERATOR_BYPASS_TOKEN .env.dev | cut -d= -f2); \
	curl -sS -X POST "http://localhost:$(API_PORT)/api/generator/generate" \
		-H "Authorization: Bearer $$AUTH_TOKEN" \
		-H "Content-Type: application/json" \
		--data @dev/sample-request.json \
		-o .dev/output/last-response.json
	@echo "$(GREEN)✓ Response saved to .dev/output/last-response.json$(RESET)"
	@jq . .dev/output/last-response.json

# Cleanup
dev-clean: ## Clean dev environment (keeps database)
	@echo "$(YELLOW)Cleaning dev logs and artifacts...$(RESET)"
	@rm -rf .dev/logs/* .dev/artifacts/* .dev/output/*
	@mkdir -p .dev/logs .dev/artifacts .dev/output
	@echo "$(GREEN)✓ Dev environment cleaned$(RESET)"

dev-clean-all: ## Clean entire dev environment (including database)
	@echo "$(RED)Removing entire .dev directory...$(RESET)"
	@rm -rf .dev
	@echo "$(GREEN)✓ Dev environment removed$(RESET)"
	@echo "$(YELLOW)Run 'make dev-setup' to recreate$(RESET)"

# Quick start workflow
dev-quick: dev-setup dev-up ## Quick start: setup and start dev environment
	@echo ""
	@echo "$(GREEN)=========================================$(RESET)"
	@echo "$(GREEN)Dev environment is ready!$(RESET)"
	@echo "$(GREEN)=========================================$(RESET)"
	@echo ""
	@echo "$(YELLOW)Note: You need to clone the production database:$(RESET)"
	@echo "  make dev-clone-db PROD_DB=/path/to/jobfinder.db"
	@echo ""
	@echo "Then restart: make dev-restart"
