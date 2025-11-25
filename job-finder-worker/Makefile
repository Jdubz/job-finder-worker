# Job Finder Worker Makefile
.PHONY: help install dev prod test coverage lint clean health status shutdown \
	dev-setup dev-clone-db dev-clone-db-scp dev-build dev-up dev-up-attached \
	dev-down dev-restart dev-logs dev-shell dev-sqlite \
	dev-test-status dev-test-watch dev-test-all dev-test-job dev-test-company \
	dev-test-clear dev-clean dev-clean-all dev-quick

PYTHON := python3
VENV_DIR := venv
WORKER_PORT := 5555
export PYTHONPATH := $(shell pwd)/src

CYAN := \033[0;36m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
RESET := \033[0m

.DEFAULT_GOAL := help

help: ## Show available commands
	@echo "$(CYAN)Job Finder Worker - Flask Application$(RESET)"
	@echo ""
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  $(CYAN)%-15s$(RESET) %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# Setup and Installation
install: ## Install dependencies in virtual environment
	@echo "$(CYAN)Installing dependencies...$(RESET)"
	@if [ ! -d "$(VENV_DIR)" ]; then \
		$(PYTHON) -m venv $(VENV_DIR); \
	fi
	@. $(VENV_DIR)/bin/activate && pip install --upgrade pip && pip install -r requirements.txt
	@echo "$(GREEN)✓ Dependencies installed$(RESET)"

install-dev: ## Install development dependencies
	@echo "$(CYAN)Installing development dependencies...$(RESET)"
	@. $(VENV_DIR)/bin/activate && pip install -r requirements.txt -r requirements-test.txt
	@echo "$(GREEN)✓ Development dependencies installed$(RESET)"

# Running the Worker
dev: ## Start worker in development mode
	@echo "$(GREEN)Starting Flask worker (development mode)...$(RESET)"
	@./run_dev.sh

prod: ## Start worker in production mode
	@echo "$(GREEN)Starting Flask worker (production mode)...$(RESET)"
	@./run_prod.sh

start: dev ## Alias for 'make dev'

# Testing
test: ## Run all tests
	@echo "$(CYAN)Running tests...$(RESET)"
	@. $(VENV_DIR)/bin/activate && pytest -v

test-ci: ## Run targeted CI/unit tests (used by git hooks)
	@echo "$(CYAN)Running targeted CI tests...$(RESET)"
	@. $(VENV_DIR)/bin/activate && pytest \
		tests/test_placeholder.py \
		tests/queue/test_scraper_intake.py \
		tests/queue/test_processor.py \
		tests/test_job_sources_manager_metadata.py \
		tests/test_job_sources_manager_health.py

test-fast: ## Run tests without coverage
	@echo "$(CYAN)Running fast tests...$(RESET)"
	@. $(VENV_DIR)/bin/activate && pytest -v --no-cov

coverage: ## Run tests with coverage report
	@echo "$(CYAN)Running tests with coverage...$(RESET)"
	@. $(VENV_DIR)/bin/activate && pytest --cov=src/job_finder --cov-report=html --cov-report=term

test-watch: ## Run tests in watch mode
	@echo "$(CYAN)Running tests in watch mode...$(RESET)"
	@. $(VENV_DIR)/bin/activate && pytest-watch

# Code Quality
lint: ## Run linter (flake8)
	@echo "$(CYAN)Running linter...$(RESET)"
	@. $(VENV_DIR)/bin/activate && flake8 src tests --max-line-length=100 --ignore=E203,W503

format: ## Format code with black
	@echo "$(CYAN)Formatting code...$(RESET)"
	@. $(VENV_DIR)/bin/activate && black src tests

type-check: ## Run type checker (mypy)
	@echo "$(CYAN)Running type checker...$(RESET)"
	@. $(VENV_DIR)/bin/activate && mypy src

# Worker Control
health: ## Check worker health
	@echo "$(CYAN)Checking worker health...$(RESET)"
	@curl -s "http://localhost:$(WORKER_PORT)/health" | jq . || echo "$(RED)Worker not responding$(RESET)"

status: ## Get worker status
	@echo "$(CYAN)Getting worker status...$(RESET)"
	@curl -s "http://localhost:$(WORKER_PORT)/status" | jq . || echo "$(RED)Worker not responding$(RESET)"

shutdown: ## Gracefully shutdown worker
	@echo "$(YELLOW)Shutting down worker...$(RESET)"
	@curl -X POST "http://localhost:$(WORKER_PORT)/shutdown" || echo "$(RED)Worker not responding$(RESET)"

# Logs
logs: ## Tail worker logs
	@tail -f logs/worker.log

logs-json: ## Tail worker logs with JSON formatting
	@tail -f logs/worker.log | jq '.'

logs-errors: ## Show only error logs
	@grep "ERROR" logs/worker.log | tail -n 50

# Cleanup
clean: ## Clean up generated files
	@echo "$(CYAN)Cleaning up...$(RESET)"
	@find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	@find . -type f -name "*.pyc" -delete 2>/dev/null || true
	@find . -type f -name ".coverage" -delete 2>/dev/null || true
	@rm -rf htmlcov .pytest_cache .mypy_cache 2>/dev/null || true
	@echo "$(GREEN)✓ Cleaned up$(RESET)"

clean-logs: ## Clean log files
	@echo "$(YELLOW)Cleaning logs...$(RESET)"
	@rm -f logs/*.log
	@echo "$(GREEN)✓ Logs cleaned$(RESET)"

clean-all: clean clean-logs ## Clean everything including venv
	@echo "$(RED)Removing virtual environment...$(RESET)"
	@rm -rf $(VENV_DIR)
	@echo "$(GREEN)✓ Everything cleaned$(RESET)"

# Development Utilities
shell: ## Start Python shell with app context
	@echo "$(CYAN)Starting Python shell...$(RESET)"
	@. $(VENV_DIR)/bin/activate && python3

check-env: ## Check environment variables
	@echo "$(CYAN)Checking environment...$(RESET)"
	@echo "JF_SQLITE_DB_PATH: $$JF_SQLITE_DB_PATH"
	@echo "ANTHROPIC_API_KEY: $$([ -n "$$ANTHROPIC_API_KEY" ] && echo 'Set' || echo 'Not set')"
	@echo "OPENAI_API_KEY: $$([ -n "$$OPENAI_API_KEY" ] && echo 'Set' || echo 'Not set')"

# Documentation
docs: ## View documentation
	@echo "$(CYAN)Available documentation:$(RESET)"
	@echo "  - README.md - General overview"
	@echo "  - FLASK_DEPLOYMENT.md - Deployment guide"
	@echo "  - DEPLOYMENT.md - Legacy deployment info"
	@echo "  - TEST_IMPROVEMENTS_FINAL_REPORT.md - Test coverage report"

# =============================================================================
# Docker Development Workflow (Production-like environment)
# =============================================================================

# Dev setup & database
dev-setup: ## Setup dev environment (creates .dev/ directories)
	@echo "$(CYAN)Setting up dev environment...$(RESET)"
	@chmod +x dev/setup-dev-env.sh
	@./dev/setup-dev-env.sh --skip-db
	@echo "$(GREEN)Dev environment ready!$(RESET)"
	@echo "$(YELLOW)Run 'make dev-clone-db' to clone production database$(RESET)"

dev-clone-db: ## Clone production database (prompts for path)
	@echo "$(CYAN)Cloning production database...$(RESET)"
	@if [ -z "$(PROD_DB)" ]; then \
		echo "$(YELLOW)Usage: make dev-clone-db PROD_DB=/path/to/jobfinder.db$(RESET)"; \
		echo ""; \
		echo "Example paths:"; \
		echo "  Local:  make dev-clone-db PROD_DB=../infra/sqlite/jobfinder.db"; \
		echo "  Server: make dev-clone-db-scp SCP_SRC=user@host:/srv/job-finder/data/jobfinder.db"; \
		exit 1; \
	fi
	@chmod +x dev/setup-dev-env.sh
	@./dev/setup-dev-env.sh --prod-db-path $(PROD_DB)

dev-clone-db-scp: ## Clone production database via SCP
	@echo "$(CYAN)Cloning production database via SCP...$(RESET)"
	@if [ -z "$(SCP_SRC)" ]; then \
		echo "$(YELLOW)Usage: make dev-clone-db-scp SCP_SRC=user@host:/path/to/jobfinder.db$(RESET)"; \
		exit 1; \
	fi
	@chmod +x dev/setup-dev-env.sh
	@./dev/setup-dev-env.sh --scp $(SCP_SRC)

# Docker commands
dev-build: ## Build dev Docker image
	@echo "$(CYAN)Building dev Docker image...$(RESET)"
	@docker compose -f docker-compose.dev.yml build
	@echo "$(GREEN)Build complete!$(RESET)"

dev-up: ## Start dev containers (detached)
	@echo "$(CYAN)Starting dev containers...$(RESET)"
	@docker compose -f docker-compose.dev.yml up -d
	@echo "$(GREEN)Containers started!$(RESET)"
	@echo "Worker: http://localhost:5555/health"
	@echo "Logs: make dev-logs"

dev-up-attached: ## Start dev containers (attached, see logs)
	@echo "$(CYAN)Starting dev containers (attached)...$(RESET)"
	@docker compose -f docker-compose.dev.yml up

dev-down: ## Stop dev containers
	@echo "$(YELLOW)Stopping dev containers...$(RESET)"
	@docker compose -f docker-compose.dev.yml down
	@echo "$(GREEN)Containers stopped$(RESET)"

dev-restart: ## Restart dev worker container
	@echo "$(YELLOW)Restarting worker...$(RESET)"
	@docker compose -f docker-compose.dev.yml restart worker
	@echo "$(GREEN)Worker restarted$(RESET)"

dev-logs: ## Tail dev worker logs
	@docker compose -f docker-compose.dev.yml logs -f worker

dev-shell: ## Open shell in worker container
	@docker compose -f docker-compose.dev.yml exec worker bash

dev-sqlite: ## Open sqlite CLI for dev database
	@docker compose -f docker-compose.dev.yml exec worker sqlite3 /data/sqlite/jobfinder.db

# Test harness commands (run inside container for consistency)
dev-test-status: ## Show queue status in dev environment
	@echo "$(CYAN)Queue Status:$(RESET)"
	@docker compose -f docker-compose.dev.yml exec worker python /app/dev/test_harness.py status

dev-test-watch: ## Watch queue processing in dev environment
	@docker compose -f docker-compose.dev.yml exec worker python /app/dev/test_harness.py watch

dev-test-all: ## Run all test scenarios
	@echo "$(CYAN)Running test scenarios...$(RESET)"
	@docker compose -f docker-compose.dev.yml exec worker python /app/dev/test_harness.py test-all

dev-test-job: ## Submit a test job (use URL=... to specify)
	@if [ -z "$(URL)" ]; then \
		echo "$(YELLOW)Usage: make dev-test-job URL=https://example.com/job$(RESET)"; \
		exit 1; \
	fi
	@docker compose -f docker-compose.dev.yml exec worker python /app/dev/test_harness.py job "$(URL)" --watch

dev-test-company: ## Submit a test company (use NAME=... to specify)
	@if [ -z "$(NAME)" ]; then \
		echo "$(YELLOW)Usage: make dev-test-company NAME='Company Name'$(RESET)"; \
		exit 1; \
	fi
	@docker compose -f docker-compose.dev.yml exec worker python /app/dev/test_harness.py company "$(NAME)" --watch

dev-test-clear: ## Clear all test items from queue
	@echo "$(YELLOW)Clearing test items...$(RESET)"
	@docker compose -f docker-compose.dev.yml exec worker python /app/dev/test_harness.py clear

# Cleanup
dev-clean: ## Clean dev environment (keeps database)
	@echo "$(YELLOW)Cleaning dev logs and temp data...$(RESET)"
	@rm -rf .dev/logs/* .dev/worker-data/*
	@touch .dev/logs/.gitkeep .dev/worker-data/.gitkeep
	@echo "$(GREEN)Dev environment cleaned$(RESET)"

dev-clean-all: ## Clean entire dev environment (including database)
	@echo "$(RED)Removing entire .dev directory...$(RESET)"
	@rm -rf .dev
	@echo "$(GREEN)Dev environment removed$(RESET)"
	@echo "$(YELLOW)Run 'make dev-setup' to recreate$(RESET)"

# Quick start workflow
dev-quick: dev-setup dev-build dev-up ## Quick start: setup, build, and start dev environment
	@echo ""
	@echo "$(GREEN)=========================================$(RESET)"
	@echo "$(GREEN)Dev environment is ready!$(RESET)"
	@echo "$(GREEN)=========================================$(RESET)"
	@echo ""
	@echo "$(YELLOW)Note: You need to clone the production database:$(RESET)"
	@echo "  make dev-clone-db PROD_DB=/path/to/jobfinder.db"
	@echo ""
	@echo "Then restart: make dev-restart"
