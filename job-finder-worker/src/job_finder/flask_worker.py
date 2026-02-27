#!/usr/bin/env python3
"""
Flask-based job queue worker with health monitoring and graceful shutdown.

This worker provides:
- HTTP health endpoint for monitoring
- Graceful shutdown via HTTP
- Process status and statistics
- Same job processing logic as the daemon worker
"""

import base64
import json
import os
import signal
import sys
import threading
import concurrent.futures
import time
import traceback
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, Any, Optional

# Add src to Python path
sys.path.insert(0, str(Path(__file__).parent.parent))

import yaml
from dotenv import load_dotenv
from flask import Flask, jsonify, request

from job_finder.ai import AIJobMatcher
from job_finder.ai.inference_client import InferenceClient
from job_finder.company_info_fetcher import CompanyInfoFetcher
from job_finder.logging_config import get_structured_logger, setup_logging
from job_finder.profile import SQLiteProfileLoader
from job_finder.profile.schema import Profile
from job_finder.job_queue import ConfigLoader, QueueManager
from job_finder.job_queue.notifier import QueueEventNotifier
from job_finder.job_queue.models import ProcessorContext, QueueStatus
from job_finder.job_queue.processor import QueueItemProcessor
from job_finder.storage import JobStorage, JobListingStorage
from job_finder.storage.sqlite_client import sqlite_connection
from job_finder.storage.companies_manager import CompaniesManager
from job_finder.storage.job_sources_manager import JobSourcesManager
from job_finder.storage.scrape_report_storage import ScrapeReportStorage
from job_finder.exceptions import InitializationError, NoAgentsAvailableError

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

# ============================================================
# WORKER CONSTANTS
# ============================================================
DEFAULT_POLL_INTERVAL_SECONDS = 60
MIN_POLL_INTERVAL_SECONDS = 10
DEFAULT_WORKER_PORT = 5555
DEFAULT_WORKER_HOST = "0.0.0.0"
WORKER_SHUTDOWN_TIMEOUT_SECONDS = 30
# Auto-restart defaults to false in production/containers to respect SIGTERM for graceful shutdown
# Set WORKER_AUTO_RESTART_ON_SIGNAL=true in development if you want auto-restart behavior
WORKER_AUTO_RESTART_ON_SIGNAL = (
    os.getenv("WORKER_AUTO_RESTART_ON_SIGNAL", "false").lower() == "true"
)
WORKER_RESTART_DELAY_SECONDS = 5

# Migration guards
REQUIRED_CONFIG_MIGRATIONS = {
    "20251205_002_tech-ranks-normalize",
}
REQUIRED_SCHEMA_MIN_ID = 46  # latest known schema migration in repo

# Global state with thread-safe access
_state_lock = threading.Lock()
worker_state = {
    "running": False,
    "shutdown_requested": False,
    "restart_requested": False,
    "items_processed_total": 0,
    "last_poll_time": None,
    "last_error": None,
    "poll_interval": DEFAULT_POLL_INTERVAL_SECONDS,
    "iteration": 0,
    "current_item_id": None,
}


def _get_state(key: str) -> Any:
    """Thread-safe getter for worker_state."""
    with _state_lock:
        return worker_state.get(key)


def _set_state(key: str, value: Any) -> None:
    """Thread-safe setter for worker_state."""
    with _state_lock:
        worker_state[key] = value


def _update_state(**kwargs: Any) -> None:
    """Thread-safe bulk update for worker_state."""
    with _state_lock:
        worker_state.update(kwargs)


def _increment_state(key: str, amount: int = 1) -> None:
    """Thread-safe increment for numeric worker_state values."""
    with _state_lock:
        worker_state[key] = worker_state.get(key, 0) + amount


def _get_state_snapshot() -> Dict[str, Any]:
    """Thread-safe snapshot of entire worker_state."""
    with _state_lock:
        return dict(worker_state)


def _extract_email_from_jwt(id_token: str) -> Optional[str]:
    """Extract email from JWT id_token payload."""
    try:
        # JWT format: header.payload.signature - we need the payload
        parts = id_token.split(".")
        if len(parts) != 3:
            return None

        # Add padding if needed for base64 decoding
        payload_b64 = parts[1]
        padding = 4 - len(payload_b64) % 4
        if padding != 4:
            payload_b64 += "=" * padding

        payload = json.loads(base64.urlsafe_b64decode(payload_b64).decode("utf-8"))
        return payload.get("email")
    except Exception:
        return None


def check_litellm_health() -> Dict[str, Any]:
    """Check LiteLLM proxy health.

    Makes a lightweight GET to the proxy's /health endpoint.
    Does not consume any AI provider quota.
    """
    import requests as _requests

    base = os.getenv("LITELLM_BASE_URL", "http://litellm:4000").rstrip("/")
    try:
        resp = _requests.get(f"{base}/health/readiness", timeout=5)
        if resp.status_code == 200:
            return {"healthy": True, "message": "LiteLLM proxy healthy", "details": resp.json()}
        return {"healthy": False, "message": f"LiteLLM returned HTTP {resp.status_code}"}
    except Exception as e:
        return {"healthy": False, "message": f"Cannot reach LiteLLM proxy: {e}"}


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
scrape_report_storage: Optional[ScrapeReportStorage] = None
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
    """Reload dynamic settings from the database into in-memory components.

    Note: InferenceClient is stateless (routes through LiteLLM), so AI provider
    settings don't need explicit reloading here.
    """
    # Load match policy (min_match_score comes from deterministic scoring)
    try:
        match_policy = config_loader.get_match_policy()
        ai_matcher.min_match_score = match_policy["minScore"]
    except Exception as exc:  # pragma: no cover - defensive
        slogger.worker_status("match_policy_load_failed", {"error": str(exc)})


def get_processing_timeout(cfg_loader: ConfigLoader) -> int:
    """Lookup processing timeout. Wrapper for backward compatibility."""
    return cfg_loader.get_processing_timeout()


def initialize_components(config: Dict[str, Any]) -> tuple:
    """Initialize all worker components."""
    db_path = os.getenv("SQLITE_DB_PATH") or os.getenv("DATABASE_PATH")

    if db_path:
        slogger.worker_status("sqlite_path_selected", {"path": db_path})

    # Fail fast if migrations are missing
    _verify_migrations(db_path or "")

    storage = JobStorage(db_path)
    job_listing_storage = JobListingStorage(db_path)
    job_sources_manager = JobSourcesManager(db_path)
    companies_manager = CompaniesManager(db_path, sources_manager=job_sources_manager)
    report_storage = ScrapeReportStorage(db_path)

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

    # Initialize config loader and inference client (LiteLLM proxy)
    config_loader = ConfigLoader(db_path)
    inference_client = InferenceClient()

    # Get match policy (deterministic scoring settings) - required, fail loud
    match_policy = config_loader.get_match_policy()

    ai_matcher = AIJobMatcher(
        agent_manager=inference_client,
        profile=profile,
        min_match_score=match_policy["minScore"],
    )

    # Company info fetcher uses InferenceClient for AI calls
    company_info_fetcher = CompanyInfoFetcher(
        agent_manager=inference_client,
        db_path=db_path,
        sources_manager=job_sources_manager,
    )
    notifier = QueueEventNotifier()
    queue_manager = QueueManager(db_path, notifier=notifier)
    notifier.on_command = queue_manager.handle_command

    # Create ProcessorContext with all dependencies
    ctx = ProcessorContext(
        queue_manager=queue_manager,
        config_loader=config_loader,
        job_storage=storage,
        job_listing_storage=job_listing_storage,
        companies_manager=companies_manager,
        sources_manager=job_sources_manager,
        company_info_fetcher=company_info_fetcher,
        ai_matcher=ai_matcher,
        notifier=notifier,
        scrape_report_storage=report_storage,
    )
    processor = QueueItemProcessor(ctx)

    apply_db_settings(config_loader, ai_matcher)

    return queue_manager, processor, config_loader, ai_matcher, config, report_storage


# ============================================================
# WORKER LOOP HELPERS
# ============================================================


def _send_heartbeat(iteration: int) -> None:
    """Send heartbeat event to notifier."""
    if queue_manager and queue_manager.notifier:
        queue_manager.notifier.send_event("heartbeat", {"iteration": iteration})


def _poll_remote_commands() -> None:
    """Poll and apply remote commands via HTTP fallback (when WS not connected)."""
    if queue_manager and queue_manager.notifier and not queue_manager.notifier.ws_connected:
        for cmd in queue_manager.notifier.poll_commands():
            queue_manager.handle_command({"event": f"command.{cmd.get('command')}", **cmd})


def _verify_migrations(db_path: str) -> None:
    """
    Ensure required schema and config migrations have been applied before
    starting the worker. Fail fast instead of letting runtime errors surface
    mid-pipeline.
    """
    with sqlite_connection(db_path) as conn:
        cfg_rows = conn.execute("SELECT name FROM config_migrations").fetchall()
        schema_rows = conn.execute("SELECT id FROM schema_migrations").fetchall()

    applied_config = {row["name"] for row in cfg_rows}
    missing_config = REQUIRED_CONFIG_MIGRATIONS.difference(applied_config)

    applied_schema_ids = {row["id"] for row in schema_rows}
    schema_ok = applied_schema_ids and max(applied_schema_ids) >= REQUIRED_SCHEMA_MIN_ID

    if missing_config or not schema_ok:
        details = []
        if missing_config:
            details.append(f"config migrations missing: {sorted(missing_config)}")
        if not schema_ok:
            details.append(
                f"schema migrations missing: expected >= {REQUIRED_SCHEMA_MIN_ID}, found {max(applied_schema_ids) if applied_schema_ids else 'none'}"
            )
        raise InitializationError("Migrations not up to date. " + "; ".join(details))


def _get_task_delay() -> float:
    """Get task delay from config with fallback to 0."""
    try:
        return config_loader.get_task_delay()
    except Exception:
        return 0.0


def _process_single_item(
    executor: concurrent.futures.ThreadPoolExecutor,
    item: Any,
    processing_timeout: int,
) -> bool:
    """
    Process a single queue item with timeout enforcement.

    Args:
        executor: ThreadPoolExecutor for timeout enforcement
        item: Queue item to process
        processing_timeout: Timeout in seconds

    Returns:
        True if processing should pause (e.g., no agents available), False otherwise.
    """
    _set_state("current_item_id", item.id)
    pause_requested = False

    try:
        future = executor.submit(processor.process_item, item)
        future.result(timeout=processing_timeout)
        _increment_state("items_processed_total")

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
        _set_state("last_error", msg)

    except NoAgentsAvailableError as nae:
        # Critical: no agents available - stop queue and reset item
        slogger.worker_status(
            "no_agents_available",
            {
                "item_id": item.id,
                "task_type": nae.task_type,
                "tried_agents": nae.tried_agents,
            },
        )
        # Reset item to pending for retry after agents become available
        queue_manager.update_status(
            item.id,
            QueueStatus.PENDING,
            f"Reset to pending: no agents available for {nae.task_type}",
        )
        # Disable processing with reason
        stop_reason = f"No agents available for {nae.task_type}"
        if nae.tried_agents:
            stop_reason += f" (tried: {', '.join(nae.tried_agents)})"
        config_loader.set_processing_disabled_with_reason(stop_reason)
        _set_state("last_error", str(nae))
        pause_requested = True

    except Exception as e:
        error_msg = str(e)
        error_details = traceback.format_exc()
        slogger.queue_item_processing(
            item_id=item.id,
            item_type=str(item.type),
            action="failed",
            details={"error": error_msg},
        )
        # Mark item as failed to prevent it from being stuck in 'processing' state
        queue_manager.update_status(
            item.id,
            QueueStatus.FAILED,
            "Processing failed due to an unhandled error",
            error_details=error_details,
        )
        _set_state("last_error", error_msg)

    finally:
        _set_state("current_item_id", None)

    return pause_requested


def _process_batch(
    executor: concurrent.futures.ThreadPoolExecutor,
    items: list,
    processing_timeout: int,
) -> bool:
    """
    Process a batch of queue items.

    Args:
        executor: ThreadPoolExecutor for timeout enforcement
        items: List of queue items to process
        processing_timeout: Timeout in seconds per item

    Returns:
        True if processing was paused, False if batch completed normally.
    """
    task_delay = _get_task_delay()

    for item in items:
        if _get_state("shutdown_requested"):
            slogger.worker_status("shutdown_in_progress")
            return False

        # Re-read processing toggle before each item so a stop request
        # takes effect even mid-batch.
        if not config_loader.is_processing_enabled():
            slogger.worker_status(
                "processing_paused",
                {"iteration": _get_state("iteration"), "reason": "disabled_in_db_mid_batch"},
            )
            return True

        pause_requested = _process_single_item(executor, item, processing_timeout)
        if pause_requested:
            return True

        if task_delay:
            time.sleep(task_delay)

    return False


def worker_loop():
    """Main worker loop - single thread drains the queue before sleeping."""
    global queue_manager, processor  # noqa: F824

    slogger.worker_status("started")
    _update_state(running=True, iteration=0)

    # One executor reused for per-item timeouts while keeping single-threaded processing
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        while not _get_state("shutdown_requested"):
            try:
                _increment_state("iteration")
                _set_state("last_poll_time", time.time())
                current_iteration = _get_state("iteration")
                poll_interval = _get_state("poll_interval")

                _send_heartbeat(current_iteration)
                _poll_remote_commands()

                # Refresh timeout from DB each loop (allows runtime changes)
                processing_timeout = get_processing_timeout(config_loader)

                # Check if processing is enabled (allows pausing via config)
                if not config_loader.is_processing_enabled():
                    slogger.worker_status("processing_paused", {"iteration": current_iteration})
                    time.sleep(poll_interval)
                    continue

                # Clear any stop reason now that processing is enabled
                config_loader.clear_stop_reason()

                # Drain the queue before sleeping
                items = queue_manager.get_pending_items()
                if not items:
                    slogger.worker_status(
                        "no_pending_items",
                        {
                            "iteration": current_iteration,
                            "total_processed": _get_state("items_processed_total"),
                        },
                    )
                    time.sleep(poll_interval)
                    continue

                slogger.worker_status(
                    "processing_batch",
                    {"count": len(items), "iteration": current_iteration},
                )

                # Process batches until queue is drained or shutdown requested
                batch_paused = False
                while items and not _get_state("shutdown_requested"):
                    batch_paused = _process_batch(executor, items, processing_timeout)
                    if batch_paused or _get_state("shutdown_requested"):
                        break
                    items = queue_manager.get_pending_items()

                # Log batch completion status
                if batch_paused:
                    slogger.worker_status(
                        "processing_paused",
                        {
                            "iteration": _get_state("iteration"),
                            "reason": "disabled_in_db_mid_batch",
                        },
                    )
                else:
                    stats = queue_manager.get_queue_stats()
                    slogger.worker_status("batch_completed", {"queue_stats": str(stats)})

                if _get_state("shutdown_requested"):
                    break
                time.sleep(poll_interval)

            except Exception as e:
                slogger.worker_status("error", {"error": str(e), "recovery": True})
                _set_state("last_error", str(e))
                time.sleep(_get_state("poll_interval"))

    slogger.worker_status("stopped", {"total_processed": _get_state("items_processed_total")})
    _set_state("running", False)

    # Check if restart was requested
    if _get_state("restart_requested"):
        global worker_thread
        slogger.worker_status("restarting", {"delay_seconds": WORKER_RESTART_DELAY_SECONDS})
        _set_state("restart_requested", False)
        _set_state("shutdown_requested", False)
        time.sleep(WORKER_RESTART_DELAY_SECONDS)

        # Restart the worker thread
        slogger.worker_status("restart_initiated")
        worker_thread = threading.Thread(target=worker_loop, daemon=True)
        worker_thread.start()
        slogger.worker_status("restarted")


# Flask routes
@app.route("/health")
def health():
    """Health check endpoint."""
    state = _get_state_snapshot()
    return jsonify(
        {
            "status": "healthy" if state["running"] else "stopped",
            "running": state["running"],
            "items_processed": state["items_processed_total"],
            "last_poll": state["last_poll_time"],
            "iteration": state["iteration"],
            "last_error": state["last_error"],
        }
    )


@app.route("/cli/health")
def cli_health():
    """Return LiteLLM proxy health status."""
    return jsonify({"litellm": check_litellm_health()})


@app.route("/status")
def status():
    """Detailed status endpoint."""
    queue_stats = {}
    if queue_manager:
        try:
            queue_stats = queue_manager.get_queue_stats()
        except Exception as e:
            queue_stats = {"error": str(e)}

    state = _get_state_snapshot()
    return jsonify(
        {
            "worker": state,
            "queue": queue_stats,
            "uptime": time.time() - state.get("start_time", time.time()),
        }
    )


@app.route("/start", methods=["POST"])
def start_worker():
    """Start the worker."""
    global worker_thread, queue_manager, processor, config_loader, ai_matcher, scrape_report_storage

    if _get_state("running"):
        slogger.worker_status("start_request_ignored", {"reason": "already_running"})
        return jsonify({"message": "Worker is already running"}), 400

    if queue_manager is None or processor is None or config_loader is None or ai_matcher is None:
        config = load_config()
        queue_manager, processor, config_loader, ai_matcher, _, scrape_report_storage = (
            initialize_components(config)
        )

    # Startup recovery: return stuck processing items to pending
    processing_timeout = get_processing_timeout(config_loader)
    reset_stuck_processing_items(
        queue_manager,
        processing_timeout,
        _get_state("poll_interval") or DEFAULT_POLL_INTERVAL_SECONDS,
    )

    _update_state(shutdown_requested=False, restart_requested=False, start_time=time.time())
    worker_thread = threading.Thread(target=worker_loop, daemon=True)
    worker_thread.start()

    slogger.worker_status("started_via_api")
    return jsonify({"message": "Worker started"})


@app.route("/stop", methods=["POST"])
def stop_worker():
    """Stop the worker gracefully."""
    if not _get_state("running"):
        return jsonify({"message": "Worker is not running"}), 400

    _set_state("shutdown_requested", True)

    # Wait for worker to stop (with timeout)
    if worker_thread and worker_thread.is_alive():
        worker_thread.join(timeout=WORKER_SHUTDOWN_TIMEOUT_SECONDS)
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
        {
            "message": "Reloaded config",
            "poll_interval": _get_state("poll_interval"),
        }
    )


@app.route("/config", methods=["GET", "POST"])
def config_endpoint():
    """Get or update worker configuration."""
    if request.method == "GET":
        return jsonify(
            {
                "poll_interval": _get_state("poll_interval"),
            }
        )

    # POST - update config
    data = request.get_json() or {}
    if "poll_interval" in data:
        _set_state("poll_interval", max(MIN_POLL_INTERVAL_SECONDS, int(data["poll_interval"])))

    return jsonify({"message": "Configuration updated"})


@app.route("/scrape/reports")
def scrape_reports_list():
    """List recent scrape reports."""
    if not scrape_report_storage:
        return jsonify({"error": "Scrape report storage not initialized"}), 503

    limit = request.args.get("limit", 20, type=int)
    safe_limit = max(1, min(limit, 100))
    reports = scrape_report_storage.get_recent_reports(limit=safe_limit)
    return jsonify({"reports": reports})


@app.route("/scrape/reports/<report_id>")
def scrape_report_detail(report_id):
    """Get a single scrape report by ID."""
    if not scrape_report_storage:
        return jsonify({"error": "Scrape report storage not initialized"}), 503

    report = scrape_report_storage.get_report(report_id)
    if not report:
        return jsonify({"error": "Report not found"}), 404
    return jsonify({"report": report})


def signal_handler(signum, frame):
    """Handle shutdown signals gracefully.

    By default, SIGTERM triggers a restart (not shutdown) to allow the worker
    to resume after container updates. Set WORKER_AUTO_RESTART_ON_SIGNAL=false
    to disable auto-restart.
    """
    if WORKER_AUTO_RESTART_ON_SIGNAL:
        slogger.worker_status("restart_requested", {"signal": signum, "auto_restart": True})
        _set_state("restart_requested", True)
        _set_state("shutdown_requested", True)
    else:
        slogger.worker_status("shutdown_requested", {"signal": signum, "auto_restart": False})
        _set_state("shutdown_requested", True)


def main():
    """Main entry point."""
    # Register signal handlers
    signal.signal(signal.SIGTERM, signal_handler)
    signal.signal(signal.SIGINT, signal_handler)

    try:
        # Load config and initialize components
        config = load_config()
        global queue_manager, processor, config_loader, ai_matcher, scrape_report_storage
        queue_manager, processor, config_loader, ai_matcher, config, scrape_report_storage = (
            initialize_components(config)
        )

        # Set poll interval from DB-backed worker runtime settings if available
        if config_loader:
            try:
                worker_settings = config_loader.get_worker_settings()
                runtime = (
                    worker_settings.get("runtime", {}) if isinstance(worker_settings, dict) else {}
                )
                _set_state(
                    "poll_interval",
                    runtime.get("pollIntervalSeconds", DEFAULT_POLL_INTERVAL_SECONDS),
                )
            except Exception:
                _set_state(
                    "poll_interval",
                    config.get("queue", {}).get("poll_interval", DEFAULT_POLL_INTERVAL_SECONDS),
                )
        else:
            _set_state(
                "poll_interval",
                config.get("queue", {}).get("poll_interval", DEFAULT_POLL_INTERVAL_SECONDS),
            )

        # Startup recovery: reset stale processing items before taking new work
        processing_timeout = get_processing_timeout(config_loader)
        reset_stuck_processing_items(
            queue_manager,
            processing_timeout,
            _get_state("poll_interval") or DEFAULT_POLL_INTERVAL_SECONDS,
        )

        # Start worker automatically
        _set_state("start_time", time.time())
        slogger.worker_status(
            "auto_starting",
            {
                "auto_restart_enabled": WORKER_AUTO_RESTART_ON_SIGNAL,
                "poll_interval": _get_state("poll_interval"),
            },
        )
        worker_thread = threading.Thread(target=worker_loop, daemon=True)
        worker_thread.start()

        # Start Flask server
        port = int(os.getenv("WORKER_PORT", str(DEFAULT_WORKER_PORT)))
        host = os.getenv("WORKER_HOST", DEFAULT_WORKER_HOST)

        slogger.worker_status("flask_server_starting", {"host": host, "port": port})
        app.run(host=host, port=port, debug=False, use_reloader=False)

    except Exception as e:
        slogger.worker_status("fatal_error", {"error": str(e)})
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
