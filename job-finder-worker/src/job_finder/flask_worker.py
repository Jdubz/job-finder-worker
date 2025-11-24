#!/usr/bin/env python3
"""
Flask-based job queue worker with health monitoring and graceful shutdown.

This worker provides:
- HTTP health endpoint for monitoring
- Graceful shutdown via HTTP
- Process status and statistics
- Same job processing logic as the daemon worker
"""
import os
import signal
import sys
import threading
import time
from pathlib import Path
from typing import Dict, Any, Optional

# Add src to Python path
sys.path.insert(0, str(Path(__file__).parent.parent))

import yaml
from dotenv import load_dotenv
from flask import Flask, jsonify, request

from job_finder.ai import AIJobMatcher
from job_finder.ai.providers import create_provider
from job_finder.company_info_fetcher import CompanyInfoFetcher
from job_finder.logging_config import get_structured_logger, setup_logging
from job_finder.profile import SQLiteProfileLoader
from job_finder.job_queue import ConfigLoader, QueueManager
from job_finder.job_queue.processor import QueueItemProcessor
from job_finder.storage import JobStorage
from job_finder.storage.companies_manager import CompaniesManager
from job_finder.storage.job_sources_manager import JobSourcesManager

# Load environment variables
load_dotenv()

# Configure logging
log_file = os.getenv("QUEUE_WORKER_LOG_FILE", "/app/logs/queue_worker.log")

# Ensure log directory exists and is writable
log_dir = os.path.dirname(log_file)
try:
    if log_dir and not os.path.exists(log_dir):
        os.makedirs(log_dir, exist_ok=True)
    if log_dir and not os.access(log_dir, os.W_OK):
        raise PermissionError(f"Log directory '{log_dir}' is not writable.")
    setup_logging(log_file=log_file)
except Exception as e:
    print(f"Failed to set up file logging at '{log_file}': {e}", file=sys.stderr)
    print("Falling back to console logging.", file=sys.stderr)
    setup_logging()  # Fallback to default (likely console) logging

slogger = get_structured_logger(__name__)

# Global state
worker_state = {
    "running": False,
    "shutdown_requested": False,
    "items_processed_total": 0,
    "last_poll_time": None,
    "last_error": None,
    "poll_interval": 60,
    "iteration": 0,
}

# Global components (initialized in main)
queue_manager: Optional[QueueManager] = None
processor: Optional[QueueItemProcessor] = None
config_loader: Optional[ConfigLoader] = None
ai_matcher: Optional[AIJobMatcher] = None
worker_thread: Optional[threading.Thread] = None

# Flask app
app = Flask(__name__)


def load_config() -> Dict[str, Any]:
    """Load configuration from YAML file."""

    override_path = os.getenv("CONFIG_PATH") or os.getenv("WORKER_CONFIG_PATH")
    search_paths = []

    if override_path:
        search_paths.append(Path(override_path).expanduser())

    # Default to the repo-level config directory baked into the image.
    repo_root = Path(__file__).resolve().parent.parent.parent
    search_paths.extend(
        [
            repo_root / "config" / "config.production.yaml",
            repo_root / "config" / "config.yaml",
            repo_root / "config" / "config.dev.yaml",
        ]
    )

    for candidate in search_paths:
        if candidate.exists():
            slogger.worker_status("config_loaded", {"path": str(candidate)})
            with open(candidate, "r", encoding="utf-8") as f:
                return yaml.safe_load(f)

    searched = ", ".join(str(path) for path in search_paths)
    raise FileNotFoundError(f"Worker config not found. Paths tried: {searched}")


def apply_db_settings(config_loader: ConfigLoader, ai_matcher: AIJobMatcher):
    """Reload dynamic settings from the database into in-memory components."""
    try:
        ai_settings = config_loader.get_ai_settings()
    except Exception as exc:  # pragma: no cover - defensive
        slogger.worker_status("ai_settings_load_failed", {"error": str(exc)})
        ai_settings = None

    if ai_settings:
        provider_type = ai_settings.get("provider", "openai")
        model = ai_settings.get("model")
        try:
            ai_matcher.provider = create_provider(provider_type, model=model)
        except Exception as exc:  # pragma: no cover - defensive
            slogger.worker_status("ai_provider_reload_failed", {"error": str(exc)})

        if "minMatchScore" in ai_settings:
            ai_matcher.min_match_score = ai_settings.get(
                "minMatchScore", ai_matcher.min_match_score
            )
        if "generateIntakeData" in ai_settings:
            ai_matcher.generate_intake = ai_settings.get(
                "generateIntakeData", ai_matcher.generate_intake
            )
        if "portlandOfficeBonus" in ai_settings:
            ai_matcher.portland_office_bonus = ai_settings.get(
                "portlandOfficeBonus", ai_matcher.portland_office_bonus
            )
        if "userTimezone" in ai_settings:
            ai_matcher.user_timezone = ai_settings.get("userTimezone", ai_matcher.user_timezone)
        if "preferLargeCompanies" in ai_settings:
            ai_matcher.prefer_large_companies = ai_settings.get(
                "preferLargeCompanies", ai_matcher.prefer_large_companies
            )

    try:
        scheduler_settings = config_loader.get_scheduler_settings()
        if scheduler_settings and "pollIntervalSeconds" in scheduler_settings:
            worker_state["poll_interval"] = max(
                5, int(scheduler_settings.get("pollIntervalSeconds", 60))
            )
    except Exception as exc:  # pragma: no cover - defensive
        slogger.worker_status("scheduler_settings_load_failed", {"error": str(exc)})


def initialize_components(config: Dict[str, Any]) -> tuple:
    """Initialize all worker components."""
    db_path = (
        os.getenv("JF_SQLITE_DB_PATH")
        or os.getenv("JOB_FINDER_SQLITE_PATH")
        or os.getenv("SQLITE_DB_PATH")
        or os.getenv("DATABASE_PATH")
    )

    if db_path:
        slogger.worker_status("sqlite_path_selected", {"path": db_path})

    storage = JobStorage(db_path)
    companies_manager = CompaniesManager(db_path)
    job_sources_manager = JobSourcesManager(db_path)

    # Initialize AI components (defaults, then override with DB)
    ai_config = config.get("ai", {})
    provider = create_provider(ai_config.get("provider", "openai"), model=ai_config.get("model"))
    ai_matcher = AIJobMatcher(
        provider=provider,
        min_match_score=ai_config.get("min_match_score", 70),
        generate_intake=ai_config.get("generate_intake_data", True),
        portland_office_bonus=ai_config.get("portland_office_bonus", 15),
        profile=None,  # Will be loaded per request
        user_timezone=ai_config.get("user_timezone", -8),
        prefer_large_companies=ai_config.get("prefer_large_companies", True),
        config=ai_config,
    )

    # Initialize other components
    profile_loader = SQLiteProfileLoader(db_path)
    company_info_fetcher = CompanyInfoFetcher(companies_manager)
    queue_manager = QueueManager(db_path)
    config_loader = ConfigLoader(db_path)
    processor = QueueItemProcessor(
        queue_manager=queue_manager,
        config_loader=config_loader,
        job_storage=storage,
        companies_manager=companies_manager,
        sources_manager=job_sources_manager,
        company_info_fetcher=company_info_fetcher,
        ai_matcher=ai_matcher,
        profile=None,  # Will be loaded per request
    )

    apply_db_settings(config_loader, ai_matcher)

    return queue_manager, processor, config_loader, ai_matcher, config


def worker_loop():
    """Main worker loop - runs in background thread."""
    global worker_state, queue_manager, processor  # noqa: F824

    slogger.worker_status("started")
    worker_state["running"] = True
    worker_state["iteration"] = 0

    while not worker_state["shutdown_requested"]:
        try:
            worker_state["iteration"] += 1
            worker_state["last_poll_time"] = time.time()

            # Get pending items
            items = queue_manager.get_pending_items()

            if items:
                slogger.worker_status(
                    "processing_batch",
                    {"count": len(items), "iteration": worker_state["iteration"]},
                )

                # Process items
                for item in items:
                    if worker_state["shutdown_requested"]:
                        slogger.worker_status("shutdown_in_progress")
                        break

                    try:
                        processor.process_item(item)
                        worker_state["items_processed_total"] += 1
                    except Exception as e:
                        slogger.logger.error(f"Error processing item {item.id}: {e}", exc_info=True)
                        worker_state["last_error"] = str(e)

                # Get updated stats
                stats = queue_manager.get_queue_stats()
                slogger.worker_status("batch_completed", {"queue_stats": str(stats)})
            else:
                slogger.worker_status(
                    "no_pending_items",
                    {
                        "iteration": worker_state["iteration"],
                        "total_processed": worker_state["items_processed_total"],
                    },
                )

            # Sleep before next poll
            time.sleep(worker_state["poll_interval"])

        except Exception as e:
            slogger.logger.error(f"Error in worker loop: {e}", exc_info=True)
            worker_state["last_error"] = str(e)
            slogger.worker_status("error_recovery")
            time.sleep(worker_state["poll_interval"])

    slogger.worker_status("stopped", {"total_processed": worker_state["items_processed_total"]})
    worker_state["running"] = False


# Flask routes
@app.route("/health")
def health():
    """Health check endpoint."""
    return jsonify(
        {
            "status": "healthy" if worker_state["running"] else "stopped",
            "running": worker_state["running"],
            "items_processed": worker_state["items_processed_total"],
            "last_poll": worker_state["last_poll_time"],
            "iteration": worker_state["iteration"],
            "last_error": worker_state["last_error"],
        }
    )


@app.route("/status")
def status():
    """Detailed status endpoint."""
    queue_stats = {}
    if queue_manager:
        try:
            queue_stats = queue_manager.get_queue_stats()
        except Exception as e:
            queue_stats = {"error": str(e)}

    return jsonify(
        {
            "worker": worker_state,
            "queue": queue_stats,
            "uptime": time.time() - (worker_state.get("start_time", time.time())),
        }
    )


@app.route("/start", methods=["POST"])
def start_worker():
    """Start the worker."""
    global worker_thread, queue_manager, processor, config_loader, ai_matcher

    if worker_state["running"]:
        return jsonify({"message": "Worker is already running"}), 400

    if queue_manager is None or processor is None or config_loader is None or ai_matcher is None:
        config = load_config()
        queue_manager, processor, config_loader, ai_matcher, _ = initialize_components(config)

    worker_state["shutdown_requested"] = False
    worker_state["start_time"] = time.time()
    worker_thread = threading.Thread(target=worker_loop, daemon=True)
    worker_thread.start()

    return jsonify({"message": "Worker started"})


@app.route("/stop", methods=["POST"])
def stop_worker():
    """Stop the worker gracefully."""
    if not worker_state["running"]:
        return jsonify({"message": "Worker is not running"}), 400

    worker_state["shutdown_requested"] = True

    # Wait for worker to stop (with timeout)
    if worker_thread and worker_thread.is_alive():
        worker_thread.join(timeout=30)
        if worker_thread.is_alive():
            return jsonify({"message": "Worker stop requested but still running"}), 202

    return jsonify({"message": "Worker stopped"})


@app.route("/restart", methods=["POST"])
def restart_worker():
    """Restart the worker."""
    stop_worker()
    time.sleep(1)  # Brief pause
    return start_worker()


@app.route("/config/reload", methods=["POST"])
def reload_config():
    """Reload dynamic settings from the DB into the running worker."""
    if not config_loader or not ai_matcher:
        return jsonify({"message": "Config loader not initialized"}), 503

    apply_db_settings(config_loader, ai_matcher)
    return jsonify(
        {"message": "Reloaded config", "poll_interval": worker_state.get("poll_interval")}
    )


@app.route("/config", methods=["GET", "POST"])
def config_endpoint():
    """Get or update worker configuration."""
    if request.method == "GET":
        return jsonify(
            {
                "poll_interval": worker_state["poll_interval"],
            }
        )

    # POST - update config
    data = request.get_json() or {}
    if "poll_interval" in data:
        worker_state["poll_interval"] = max(10, int(data["poll_interval"]))  # Min 10 seconds

    return jsonify({"message": "Configuration updated"})


def signal_handler(signum, frame):
    """Handle shutdown signals gracefully."""
    slogger.worker_status("shutdown_requested", {"signal": signum})
    worker_state["shutdown_requested"] = True


def main():
    """Main entry point."""
    # Register signal handlers
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    try:
        # Load config and initialize components
        config = load_config()
        global queue_manager, processor, config_loader, ai_matcher
        queue_manager, processor, config_loader, ai_matcher, config = initialize_components(config)

        # Set poll interval from DB-backed scheduler settings if available
        if config_loader:
            try:
                scheduler_settings = config_loader.get_scheduler_settings()
                worker_state["poll_interval"] = scheduler_settings.get("pollIntervalSeconds", 60)
            except Exception:
                worker_state["poll_interval"] = config.get("queue", {}).get("poll_interval", 60)
        else:
            worker_state["poll_interval"] = config.get("queue", {}).get("poll_interval", 60)

        # Start worker automatically
        worker_state["start_time"] = time.time()
        worker_thread = threading.Thread(target=worker_loop, daemon=True)
        worker_thread.start()

        # Start Flask server
        port = int(os.getenv("WORKER_PORT", "5555"))
        host = os.getenv("WORKER_HOST", "0.0.0.0")

        slogger.worker_status("flask_server_starting", {"host": host, "port": port})
        app.run(host=host, port=port, debug=False, use_reloader=False)

    except Exception as e:
        slogger.logger.error(f"Fatal error in Flask worker: {e}", exc_info=True)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
