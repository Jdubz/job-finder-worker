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
import concurrent.futures
import time
from pathlib import Path
from typing import Dict, Any, Optional

# Add src to Python path
sys.path.insert(0, str(Path(__file__).parent.parent))

import yaml
from dotenv import load_dotenv
from flask import Flask, jsonify, request

from job_finder.ai import AIJobMatcher
from job_finder.ai.providers import create_provider_from_config
from job_finder.company_info_fetcher import CompanyInfoFetcher
from job_finder.logging_config import get_structured_logger, setup_logging
from job_finder.maintenance import run_maintenance
from job_finder.profile import SQLiteProfileLoader
from job_finder.profile.schema import Profile
from job_finder.job_queue import ConfigLoader, QueueManager
from job_finder.job_queue.notifier import QueueEventNotifier
from job_finder.job_queue.models import QueueStatus
from job_finder.job_queue.processor import QueueItemProcessor
from job_finder.storage import JobStorage
from job_finder.storage.companies_manager import CompaniesManager
from job_finder.storage.job_sources_manager import JobSourcesManager
from job_finder.exceptions import InitializationError

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

    for candidate in search_paths:
        if candidate.exists():
            slogger.worker_status("config_loaded", {"path": str(candidate)})
            with open(candidate, "r", encoding="utf-8") as f:
                return yaml.safe_load(f)

    # No config file found; fall back to empty config. All runtime settings are
    # expected from the SQLite-backed job_finder_config table.
    if search_paths:
        slogger.worker_status("config_missing", {"paths_tried": [str(p) for p in search_paths]})
    return {}


def apply_db_settings(config_loader: ConfigLoader, ai_matcher: AIJobMatcher):
    """Reload dynamic settings from the database into in-memory components."""
    # Load AI provider settings
    try:
        ai_settings = config_loader.get_ai_settings()
        ai_matcher.provider = create_provider_from_config(ai_settings)
    except Exception as exc:  # pragma: no cover - defensive
        slogger.worker_status("ai_provider_reload_failed", {"error": str(exc)})

    # Load job match settings (scoring preferences)
    try:
        job_match = config_loader.get_job_match()
        ai_matcher.min_match_score = job_match.get("minMatchScore", ai_matcher.min_match_score)
        ai_matcher.generate_intake = job_match.get("generateIntakeData", ai_matcher.generate_intake)
        ai_matcher.portland_office_bonus = job_match.get(
            "portlandOfficeBonus", ai_matcher.portland_office_bonus
        )
        ai_matcher.user_timezone = job_match.get("userTimezone", ai_matcher.user_timezone)
        ai_matcher.prefer_large_companies = job_match.get(
            "preferLargeCompanies", ai_matcher.prefer_large_companies
        )
    except Exception as exc:  # pragma: no cover - defensive
        slogger.worker_status("job_match_settings_load_failed", {"error": str(exc)})

    # Load scheduler settings
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

    # Initialize other components
    profile_loader = SQLiteProfileLoader(db_path)
    try:
        profile = profile_loader.load_profile()
    except InitializationError as exc:
        slogger.worker_status("profile_load_failed", {"error": str(exc)})
        profile = Profile(
            name="Fallback User",
            email=None,
            location=None,
            summary=None,
            years_of_experience=None,
            skills=[],
            experience=[],
            education=[],
            projects=[],
            certifications=[],
            languages=[],
            preferences=None,
        )

    # Initialize AI components with defaults (will be overridden by DB settings)
    config_loader = ConfigLoader(db_path)

    # Get AI provider settings (defaults to codex/cli/gpt-4o-mini)
    ai_settings = {
        "selected": {"provider": "codex", "interface": "cli", "model": "gpt-4o-mini"},
        "providers": [],
    }
    try:
        ai_settings = config_loader.get_ai_settings()
    except Exception as exc:
        slogger.worker_status("ai_settings_init_failed", {"error": str(exc)})

    provider = create_provider_from_config(ai_settings)

    # Get job match settings (defaults)
    job_match = {
        "minMatchScore": 70,
        "portlandOfficeBonus": 15,
        "userTimezone": -8,
        "preferLargeCompanies": True,
        "generateIntakeData": True,
    }
    try:
        job_match = config_loader.get_job_match()
    except Exception as exc:
        slogger.worker_status("job_match_init_failed", {"error": str(exc)})

    ai_matcher = AIJobMatcher(
        provider=provider,
        min_match_score=job_match.get("minMatchScore", 70),
        generate_intake=job_match.get("generateIntakeData", True),
        portland_office_bonus=job_match.get("portlandOfficeBonus", 15),
        profile=profile,
        user_timezone=job_match.get("userTimezone", -8),
        prefer_large_companies=job_match.get("preferLargeCompanies", True),
        config=job_match,
    )

    company_info_fetcher = CompanyInfoFetcher(companies_manager)
    notifier = QueueEventNotifier()
    queue_manager = QueueManager(db_path, notifier=notifier)
    notifier.on_command = queue_manager.handle_command
    processor = QueueItemProcessor(
        queue_manager=queue_manager,
        config_loader=config_loader,
        job_storage=storage,
        companies_manager=companies_manager,
        sources_manager=job_sources_manager,
        company_info_fetcher=company_info_fetcher,
        ai_matcher=ai_matcher,
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

            # Heartbeat
            if queue_manager and queue_manager.notifier:
                queue_manager.notifier.send_event(
                    "heartbeat", {"iteration": worker_state["iteration"]}
                )

            # Apply remote commands before picking new work (HTTP fallback only if WS not connected)
            if queue_manager and queue_manager.notifier and not queue_manager.notifier.ws_connected:
                for cmd in queue_manager.notifier.poll_commands():
                    queue_manager.handle_command({"event": f"command.{cmd.get('command')}", **cmd})

            # Get pending items
            items = queue_manager.get_pending_items()

            # Refresh timeout from DB each loop (allows runtime changes)
            try:
                queue_settings = config_loader.get_queue_settings()
                processing_timeout = max(
                    5, int(queue_settings.get("processingTimeoutSeconds", 1800))
                )
            except Exception as exc:  # pragma: no cover - defensive
                slogger.worker_status("queue_settings_load_failed", {"error": str(exc)})
                processing_timeout = 1800

            if items:
                slogger.worker_status(
                    "processing_batch",
                    {"count": len(items), "iteration": worker_state["iteration"]},
                )

                # Process items
                with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                    for item in items:
                        if worker_state["shutdown_requested"]:
                            slogger.worker_status("shutdown_in_progress")
                            break

                        future = executor.submit(processor.process_item, item)
                        try:
                            future.result(timeout=processing_timeout)
                            worker_state["items_processed_total"] += 1
                        except concurrent.futures.TimeoutError:
                            msg = f"Processing exceeded timeout ({processing_timeout}s)"
                            slogger.worker_status(
                                "processing_timeout",
                                {"item_id": item.id, "timeout_seconds": processing_timeout},
                            )
                            queue_manager.update_status(
                                item.id,
                                QueueStatus.FAILED,
                                msg,
                                error_details=msg,
                            )
                            worker_state["last_error"] = msg
                        except Exception as e:
                            slogger.logger.error(
                                f"Error processing item {item.id}: {e}", exc_info=True
                            )
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


@app.route("/maintenance", methods=["POST"])
def maintenance_endpoint():
    """
    Run maintenance tasks: delete stale matches and recalculate priorities.

    This endpoint triggers the maintenance cycle which:
    - Deletes job matches older than 2 weeks
    - Recalculates application priorities based on match scores
    """
    slogger.worker_status("maintenance_started")
    results = run_maintenance()  # db_path resolved internally via resolve_db_path
    slogger.worker_status("maintenance_completed", results)

    if results["success"]:
        return jsonify(
            {
                "message": "Maintenance completed successfully",
                "deleted_count": results["deleted_count"],
                "updated_count": results["updated_count"],
            }
        )
    else:
        return (
            jsonify(
                {
                    "message": "Maintenance failed",
                    "error": results["error"],
                }
            ),
            500,
        )


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
