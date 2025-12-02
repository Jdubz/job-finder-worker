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
from datetime import datetime, timedelta, timezone
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
from job_finder.storage import JobStorage, JobListingStorage
from job_finder.storage.sqlite_client import sqlite_connection
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
    "current_item_id": None,
}


def reset_stuck_processing_items(
    queue_manager: QueueManager, processing_timeout: int, poll_interval: int
) -> int:
    """Move long-running processing items back to pending on startup.

    Grace window is max(processing_timeout, 2 * poll_interval) to avoid
    double-processing items that might still legitimately be running.
    Returns the number of items reset.
    """

    grace = max(processing_timeout, poll_interval * 2)
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=grace)
    cutoff_iso = cutoff.isoformat()

    try:
        with sqlite_connection(queue_manager.db_path) as conn:
            cursor = conn.execute(
                """
                UPDATE job_queue
                SET status = ?, updated_at = ?
                WHERE status = ? AND datetime(updated_at) < ?
                """,
                (
                    QueueStatus.PENDING.value,
                    cutoff_iso,
                    QueueStatus.PROCESSING.value,
                    cutoff_iso,
                ),
            )
            reset_count = cursor.rowcount
    except Exception as exc:  # pragma: no cover - defensive
        slogger.worker_status("startup_recovery_failed", {"error": str(exc)})
        return 0

    if reset_count:
        slogger.worker_status(
            "startup_recovered_processing",
            {"count": reset_count, "cutoff": cutoff_iso},
        )
    else:
        slogger.worker_status("startup_recovered_processing", {"count": 0})
    return reset_count


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
    # Load AI provider settings (must use task="jobMatch" to respect per-task config)
    try:
        ai_settings = config_loader.get_ai_settings()
        ai_matcher.provider = create_provider_from_config(ai_settings, task="jobMatch")
    except Exception as exc:  # pragma: no cover - defensive
        slogger.worker_status("ai_provider_reload_failed", {"error": str(exc)})

    # Load match policy (scoring preferences + dealbreakers)
    try:
        match_policy = config_loader.get_match_policy()
        job_match = match_policy.get("jobMatch", {})
        company_weights = match_policy.get("companyWeights", {})
        ai_matcher.min_match_score = job_match.get("minMatchScore", ai_matcher.min_match_score)
        ai_matcher.generate_intake = job_match.get("generateIntakeData", ai_matcher.generate_intake)
        ai_matcher.portland_office_bonus = job_match.get(
            "portlandOfficeBonus", ai_matcher.portland_office_bonus
        )
        ai_matcher.user_timezone = job_match.get("userTimezone", ai_matcher.user_timezone)
        ai_matcher.prefer_large_companies = job_match.get(
            "preferLargeCompanies", ai_matcher.prefer_large_companies
        )
        ai_matcher.company_weights = company_weights or ai_matcher.company_weights
        ai_matcher.dealbreakers = match_policy.get("dealbreakers", ai_matcher.dealbreakers)
    except Exception as exc:  # pragma: no cover - defensive
        slogger.worker_status("match_policy_load_failed", {"error": str(exc)})


def get_processing_timeout(config_loader: ConfigLoader) -> int:
    """Lookup processing timeout (fail loud on missing config)."""
    queue_settings = config_loader.get_queue_settings()
    return max(5, int(queue_settings.get("processingTimeoutSeconds", 1800)))


def initialize_components(config: Dict[str, Any]) -> tuple:
    """Initialize all worker components."""
    db_path = os.getenv("SQLITE_DB_PATH") or os.getenv("DATABASE_PATH")

    if db_path:
        slogger.worker_status("sqlite_path_selected", {"path": db_path})

    storage = JobStorage(db_path)
    job_listing_storage = JobListingStorage(db_path)
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

    # Get AI provider settings (defaults to codex/cli/gpt-4o for both worker and doc gen)
    ai_settings = {
        "worker": {"selected": {"provider": "codex", "interface": "cli", "model": "gpt-4o"}},
        "documentGenerator": {
            "selected": {"provider": "codex", "interface": "cli", "model": "gpt-4o"}
        },
        "options": [],
    }
    try:
        ai_settings = config_loader.get_ai_settings()
    except Exception as exc:
        slogger.worker_status("ai_settings_init_failed", {"error": str(exc)})

    # Create task-specific providers (falls back to default if no task override)
    job_match_provider = create_provider_from_config(ai_settings, task="jobMatch")
    company_discovery_provider = create_provider_from_config(ai_settings, task="companyDiscovery")

    # Use the same AI settings section for all downstream AI users (matcher + company fetcher)
    worker_ai_config: Dict[str, Any] = {}
    if isinstance(ai_settings, dict):
        candidate = ai_settings.get("worker") or ai_settings
        if isinstance(candidate, dict):
            worker_ai_config = candidate

    # Get match policy (scoring + weights + dealbreakers)
    match_policy = {
        "jobMatch": {
            "minMatchScore": 70,
            "portlandOfficeBonus": 15,
            "userTimezone": -8,
            "preferLargeCompanies": True,
            "generateIntakeData": True,
        },
        "companyWeights": {},
        "dealbreakers": {},
    }
    try:
        match_policy = config_loader.get_match_policy()
    except Exception as exc:
        slogger.worker_status("match_policy_init_failed", {"error": str(exc)})

    job_match_cfg = match_policy.get("jobMatch", {})

    ai_matcher = AIJobMatcher(
        provider=job_match_provider,
        min_match_score=job_match_cfg.get("minMatchScore", 70),
        generate_intake=job_match_cfg.get("generateIntakeData", True),
        portland_office_bonus=job_match_cfg.get("portlandOfficeBonus", 15),
        profile=profile,
        user_timezone=job_match_cfg.get("userTimezone", -8),
        prefer_large_companies=job_match_cfg.get("preferLargeCompanies", True),
        config=job_match_cfg,
        company_weights=match_policy.get("companyWeights"),
        dealbreakers=match_policy.get("dealbreakers"),
    )

    # Respect AI settings when fetching/extracting company info
    company_info_fetcher = CompanyInfoFetcher(
        ai_provider=company_discovery_provider,
        ai_config=worker_ai_config,
        db_path=db_path,
    )
    notifier = QueueEventNotifier()
    queue_manager = QueueManager(db_path, notifier=notifier)
    notifier.on_command = queue_manager.handle_command
    processor = QueueItemProcessor(
        queue_manager=queue_manager,
        config_loader=config_loader,
        job_storage=storage,
        job_listing_storage=job_listing_storage,
        companies_manager=companies_manager,
        sources_manager=job_sources_manager,
        company_info_fetcher=company_info_fetcher,
        ai_matcher=ai_matcher,
    )

    apply_db_settings(config_loader, ai_matcher)

    return queue_manager, processor, config_loader, ai_matcher, config


def worker_loop():
    """Main worker loop - single thread drains the queue before sleeping."""
    global worker_state, queue_manager, processor  # noqa: F824

    slogger.worker_status("started")
    worker_state["running"] = True
    worker_state["iteration"] = 0

    # One executor reused for per-item timeouts while keeping single-threaded processing
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
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
                if (
                    queue_manager
                    and queue_manager.notifier
                    and not queue_manager.notifier.ws_connected
                ):
                    for cmd in queue_manager.notifier.poll_commands():
                        queue_manager.handle_command(
                            {"event": f"command.{cmd.get('command')}", **cmd}
                        )

                # Refresh timeout from DB each loop (allows runtime changes)
                processing_timeout = get_processing_timeout(config_loader)
                # Check if processing is enabled (allows pausing via config)
                if not config_loader.is_processing_enabled():
                    slogger.worker_status(
                        "processing_paused",
                        {"iteration": worker_state["iteration"]},
                    )
                    time.sleep(worker_state["poll_interval"])
                    continue

                # Drain the queue before sleeping
                items = queue_manager.get_pending_items()
                if not items:
                    slogger.worker_status(
                        "no_pending_items",
                        {
                            "iteration": worker_state["iteration"],
                            "total_processed": worker_state["items_processed_total"],
                        },
                    )
                    time.sleep(worker_state["poll_interval"])
                    continue

                slogger.worker_status(
                    "processing_batch",
                    {"count": len(items), "iteration": worker_state["iteration"]},
                )

                batch_paused = False

                while items and not worker_state["shutdown_requested"]:
                    try:
                        # Refresh delay once per batch; config changes apply to the next batch.
                        queue_settings = config_loader.get_queue_settings()
                        task_delay = max(0, int(queue_settings.get("taskDelaySeconds", 0)))
                    except Exception:
                        task_delay = 0

                    pause_requested = False
                    for item in items:
                        if worker_state["shutdown_requested"]:
                            slogger.worker_status("shutdown_in_progress")
                            break

                        # Re-read processing toggle before each item so a stop request
                        # takes effect even mid-batch.
                        if not config_loader.is_processing_enabled():
                            pause_requested = True
                            slogger.worker_status(
                                "processing_paused",
                                {
                                    "iteration": worker_state["iteration"],
                                    "reason": "disabled_in_db_mid_batch",
                                },
                            )
                            break

                        worker_state["current_item_id"] = item.id

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
                        finally:
                            worker_state["current_item_id"] = None

                        if task_delay:
                            time.sleep(task_delay)

                    if pause_requested:
                        batch_paused = True
                        break

                    # Fetch the next batch (if any) and continue immediately
                    if worker_state["shutdown_requested"]:
                        break
                    items = queue_manager.get_pending_items()

                # Queue drained; capture stats once and then sleep until next poll window
                if batch_paused:
                    slogger.worker_status(
                        "processing_paused",
                        {
                            "iteration": worker_state["iteration"],
                            "reason": "disabled_in_db_mid_batch",
                        },
                    )
                else:
                    stats = queue_manager.get_queue_stats()
                    slogger.worker_status("batch_completed", {"queue_stats": str(stats)})

                if worker_state["shutdown_requested"]:
                    break
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

    # Startup recovery: return stuck processing items to pending
    processing_timeout = get_processing_timeout(config_loader)
    reset_stuck_processing_items(
        queue_manager, processing_timeout, worker_state.get("poll_interval", 60)
    )

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

        # Startup recovery: reset stale processing items before taking new work
        processing_timeout = get_processing_timeout(config_loader)
        reset_stuck_processing_items(
            queue_manager, processing_timeout, worker_state.get("poll_interval", 60)
        )

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
