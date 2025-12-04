# Job Finder Frontend Makefile
.PHONY: help install start stop test lint

CYAN := \033[0;36m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RESET := \033[0m

.DEFAULT_GOAL := help

help: ## Show available commands
	@echo "$(CYAN)Job Finder Frontend$(RESET)"
	@echo ""
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  $(CYAN)%-15s$(RESET) %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies
	@npm install

start: ## Start Vite dev server (port 5173)
	@npm run dev

stop: ## Stop Vite dev server
	@lsof -ti:5173 | xargs kill -9 2>/dev/null || true

test: ## Run tests
	@npm test

lint: ## Run linter
	@npm run lint
