# Job Applicator Makefile
.PHONY: help install dev dev-prod build lint typecheck test test-watch clean fix-sandbox

NPM := npm

# Local API configuration (localhost-only, bypasses auth)
# The API is exposed on localhost:3000 via docker port mapping
LOCAL_API_URL := http://localhost:3000/api
PROD_DB_PATH := /srv/job-finder/data
PROD_ARTIFACTS_DIR := /srv/job-finder/artifacts

# Electron sandbox workaround for development
# Set to empty string to use normal sandbox (requires fix-sandbox first)
ELECTRON_DISABLE_SANDBOX := --no-sandbox

CYAN := \033[0;36m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
RESET := \033[0m

.DEFAULT_GOAL := help

help: ## Show available commands
	@echo "$(CYAN)Job Applicator - Electron Application$(RESET)"
	@echo ""
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  $(CYAN)%-15s$(RESET) %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# Setup and Installation
install: ## Install dependencies
	@echo "$(CYAN)Installing dependencies...$(RESET)"
	@$(NPM) install
	@echo "$(GREEN)✓ Dependencies installed$(RESET)"

# Development
dev: ## Start in dev mode (local backend)
	@echo "$(GREEN)Starting Electron app (local backend)...$(RESET)"
	@$(NPM) run build && npx electron $(ELECTRON_DISABLE_SANDBOX) .

dev-prod: ## Start in dev mode (one-shot) with local API (localhost:3000)
	@echo "$(GREEN)Starting Electron app with local API...$(RESET)"
	@echo "$(YELLOW)API: $(LOCAL_API_URL)$(RESET)"
	@echo "$(YELLOW)Artifacts: $(PROD_ARTIFACTS_DIR)$(RESET)"
	@JOB_FINDER_API_URL="$(LOCAL_API_URL)" \
		GENERATOR_ARTIFACTS_DIR="$(PROD_ARTIFACTS_DIR)" \
		sh -c '$(NPM) run build && npx electron $(ELECTRON_DISABLE_SANDBOX) .'

watch: ## Start with hot reload using local API (watches for changes)
	@echo "$(GREEN)Starting Electron app with hot reload (local API)...$(RESET)"
	@echo "$(YELLOW)API: $(LOCAL_API_URL)$(RESET)"
	@echo "$(YELLOW)Artifacts: $(PROD_ARTIFACTS_DIR)$(RESET)"
	@echo "$(CYAN)Watching for changes... (Ctrl+C to stop)$(RESET)"
	@$(NPM) run build
	@$(NPM) run watch:build &
	@JOB_FINDER_API_URL="$(LOCAL_API_URL)" \
		GENERATOR_ARTIFACTS_DIR="$(PROD_ARTIFACTS_DIR)" \
		ELECTRONMON_LOGLEVEL=info \
		npx electronmon $(ELECTRON_DISABLE_SANDBOX) .

# Sandbox fix (run once, requires sudo)
fix-sandbox: ## Fix Electron sandbox permissions (requires sudo)
	@echo "$(YELLOW)Fixing Electron sandbox permissions...$(RESET)"
	@CHROME_SANDBOX=$$(find ../node_modules/electron -name chrome-sandbox 2>/dev/null | head -1); \
	if [ -n "$$CHROME_SANDBOX" ]; then \
		sudo chown root:root "$$CHROME_SANDBOX" && \
		sudo chmod 4755 "$$CHROME_SANDBOX" && \
		echo "$(GREEN)✓ Sandbox fixed. You can now run without --no-sandbox$(RESET)"; \
	else \
		echo "$(RED)chrome-sandbox not found$(RESET)"; \
	fi

# Build
build: ## Build TypeScript
	@echo "$(CYAN)Building TypeScript...$(RESET)"
	@$(NPM) run build
	@echo "$(GREEN)✓ Build complete$(RESET)"

# Code Quality
lint: ## Run linter
	@echo "$(CYAN)Running linter...$(RESET)"
	@$(NPM) run lint

typecheck: ## Run TypeScript type checker
	@echo "$(CYAN)Running type checker...$(RESET)"
	@$(NPM) run typecheck

# Testing
test: ## Run tests
	@echo "$(CYAN)Running tests...$(RESET)"
	@$(NPM) test

test-watch: ## Run tests in watch mode
	@echo "$(CYAN)Running tests in watch mode...$(RESET)"
	@$(NPM) run test:watch

test-coverage: ## Run tests with coverage
	@echo "$(CYAN)Running tests with coverage...$(RESET)"
	@$(NPM) run test:coverage

# Cleanup
clean: ## Clean build artifacts
	@echo "$(CYAN)Cleaning up...$(RESET)"
	@rm -rf dist coverage
	@echo "$(GREEN)✓ Cleaned up$(RESET)"
