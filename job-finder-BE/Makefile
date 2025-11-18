# Job Finder Backend Makefile
.PHONY: help install start stop test lint

CYAN := \033[0;36m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RESET := \033[0m

.DEFAULT_GOAL := help

help: ## Show available commands
	@echo "$(CYAN)Job Finder Backend$(RESET)"
	@echo ""
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  $(CYAN)%-15s$(RESET) %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies
	@npm install

start: ## Start Firebase emulators (ports 8080, 9099, 5001, 9199, 4000)
	@echo "$(CYAN)Starting Firebase emulators...$(RESET)"
	@firebase emulators:start --only auth,functions,firestore,storage,ui \
		--import=.firebase/emulator-data \
		--export-on-exit=.firebase/emulator-data

stop: ## Stop Firebase emulators
	@lsof -ti:8080 | xargs kill -9 2>/dev/null || true
	@lsof -ti:9099 | xargs kill -9 2>/dev/null || true
	@lsof -ti:5001 | xargs kill -9 2>/dev/null || true
	@lsof -ti:9199 | xargs kill -9 2>/dev/null || true
	@lsof -ti:4000 | xargs kill -9 2>/dev/null || true

test: ## Run tests
	@npm test

lint: ## Run linter
	@npm run lint
