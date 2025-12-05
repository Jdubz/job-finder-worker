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
from job_finder.ai.agent_manager import AgentManager
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


def _check_codex_config() -> Dict[str, Any]:
    """Check Codex CLI auth by inspecting config files.

    This avoids running 'codex login status' command.
    We verify that auth credentials exist in ~/.codex/auth.json.
    """
    codex_dir = Path.home() / ".codex"
    auth_path = codex_dir / "auth.json"

    try:
        with open(auth_path, "r", encoding="utf-8") as f:
            auth = json.load(f)

        # Check for API key in file
        if auth.get("OPENAI_API_KEY"):
            return {
                "healthy": True,
                "message": "API key configured",
            }

        # Check for API key in environment
        if os.getenv("OPENAI_API_KEY"):
            return {
                "healthy": True,
                "message": "API key configured (from environment)",
            }

        # Check for OAuth tokens
        tokens = auth.get("tokens", {})
        if tokens.get("refresh_token"):
            # Try to extract email from id_token
            id_token = tokens.get("id_token")
            if id_token:
                email = _extract_email_from_jwt(id_token)
                if email:
                    return {
                        "healthy": True,
                        "message": f"Authenticated as {email}",
                    }

            return {
                "healthy": True,
                "message": "OAuth credentials configured",
            }

        return {
            "healthy": False,
            "message": "Codex CLI not authenticated: no credentials found",
        }

    except FileNotFoundError:
        # If auth file doesn't exist, check for API key in environment
        if os.getenv("OPENAI_API_KEY"):
            return {
                "healthy": True,
                "message": "API key configured (from environment)",
            }
        return {
            "healthy": False,
            "message": "Codex CLI not configured: auth file not found",
        }
    except json.JSONDecodeError as exc:
        return {
            "healthy": False,
            "message": f"Codex config file invalid: {exc}",
        }
    except Exception as exc:  # pragma: no cover - defensive
        return {
            "healthy": False,
            "message": f"Failed to check Codex config: {exc}",
        }


def _check_gemini_config() -> Dict[str, Any]:
    """Check Gemini CLI auth by inspecting config files.

    This avoids launching the interactive CLI or consuming API quota.
    We verify that auth was configured and credentials exist.
    """
    gemini_dir = Path.home() / ".gemini"
    settings_path = gemini_dir / "settings.json"

    # First, try to read and parse settings.json
    try:
        with open(settings_path, "r", encoding="utf-8") as f:
            settings = json.load(f)
    except FileNotFoundError:
        return {
            "healthy": False,
            "message": "Gemini CLI not configured: settings file not found",
        }
    except json.JSONDecodeError as exc:
        return {
            "healthy": False,
            "message": f"Gemini settings file invalid: {exc}",
        }
    except Exception as exc:  # pragma: no cover - defensive
        return {
            "healthy": False,
            "message": f"Failed to read Gemini settings: {exc}",
        }

    auth_type = settings.get("security", {}).get("auth", {}).get("selectedType")
    if not auth_type:
        return {
            "healthy": False,
            "message": "Gemini CLI not configured: no auth type selected",
        }

    # For OAuth auth types, verify credentials file exists with refresh token
    if auth_type.startswith("oauth"):
        creds_path = gemini_dir / "oauth_creds.json"
        try:
            with open(creds_path, "r", encoding="utf-8") as f:
                creds = json.load(f)
        except FileNotFoundError:
            return {
                "healthy": False,
                "message": "Gemini OAuth credentials file not found",
            }
        except json.JSONDecodeError as exc:
            return {
                "healthy": False,
                "message": f"Gemini OAuth credentials file invalid: {exc}",
            }
        except Exception as exc:  # pragma: no cover - defensive
            return {
                "healthy": False,
                "message": f"Failed to read Gemini OAuth credentials: {exc}",
            }

        if not creds.get("refresh_token"):
            return {
                "healthy": False,
                "message": "Gemini OAuth credentials missing refresh token",
            }

        # Check for active account
        accounts_path = gemini_dir / "google_accounts.json"
        try:
            with open(accounts_path, "r", encoding="utf-8") as f:
                accounts = json.load(f)
            if accounts.get("active"):
                return {
                    "healthy": True,
                    "message": f"Authenticated as {accounts['active']}",
                }
        except (FileNotFoundError, json.JSONDecodeError):
            pass  # Account file is optional

        return {
            "healthy": True,
            "message": "OAuth credentials configured",
        }

    # For API key auth, check environment variables
    if auth_type == "api-key":
        has_key = bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))
        return {
            "healthy": has_key,
            "message": (
                "API key configured" if has_key else "Gemini API key not found in environment"
            ),
        }

    # For other auth types (like gcloud), assume configured if settings exist
    return {
        "healthy": True,
        "message": f"Auth type '{auth_type}' configured",
    }


def check_cli_health() -> Dict[str, Dict[str, Any]]:
    """Run lightweight auth/availability checks for agent CLIs.

    Both codex and gemini use config-file based checks to avoid:
    - Running commands that might launch interactive terminals
    - Consuming API quota
    - Slow subprocess execution
    """
    return {
        "codex": _check_codex_config(),
        "gemini": _check_gemini_config(),
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
    """Reload dynamic settings from the database into in-memory components.

    Note: AgentManager reads fresh config on each call, so AI provider settings
    don't need explicit reloading here.
    """
    # Load match policy (min_match_score comes from deterministic scoring)
    try:
        match_policy = config_loader.get_match_policy()
        ai_matcher.min_match_score = match_policy["minScore"]
    except Exception as exc:  # pragma: no cover - defensive
        slogger.worker_status("match_policy_load_failed", {"error": str(exc)})


def get_processing_timeout(config_loader: ConfigLoader) -> int:
    """Lookup processing timeout (fail loud on missing config)."""
    worker_settings = config_loader.get_worker_settings()
    runtime = worker_settings.get("runtime", {}) if isinstance(worker_settings, dict) else {}
    if not isinstance(runtime, dict):
        raise InitializationError("worker-settings.runtime missing or invalid")
    return max(5, int(runtime.get("processingTimeoutSeconds", 1800)))


def initialize_components(config: Dict[str, Any]) -> tuple:
    """Initialize all worker components."""
    db_path = os.getenv("SQLITE_DB_PATH") or os.getenv("DATABASE_PATH")

    if db_path:
        slogger.worker_status("sqlite_path_selected", {"path": db_path})

    storage = JobStorage(db_path)
    job_listing_storage = JobListingStorage(db_path)
    job_sources_manager = JobSourcesManager(db_path)
    companies_manager = CompaniesManager(db_path, sources_manager=job_sources_manager)

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

    # Initialize config loader and agent manager
    config_loader = ConfigLoader(db_path)
    agent_manager = AgentManager(config_loader)

    # Get match policy (deterministic scoring settings) - required, fail loud
    match_policy = config_loader.get_match_policy()

    ai_matcher = AIJobMatcher(
        agent_manager=agent_manager,
        profile=profile,
        min_match_score=match_policy["minScore"],
        generate_intake=True,
    )

    # Company info fetcher uses AgentManager for AI calls
    company_info_fetcher = CompanyInfoFetcher(
        agent_manager=agent_manager,
        db_path=db_path,
        sources_manager=job_sources_manager,
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

                # Clear any stop reason now that processing is enabled
                config_loader.clear_stop_reason()

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
                        worker_settings = config_loader.get_worker_settings()
                        runtime = (
                            worker_settings.get("runtime", {})
                            if isinstance(worker_settings, dict)
                            else {}
                        )
                        task_delay = max(0, int(runtime.get("taskDelaySeconds", 0)))
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
                                {
                                    "item_id": item.id,
                                    "timeout_seconds": processing_timeout,
                                },
                            )
                            queue_manager.update_status(
                                item.id,
                                QueueStatus.FAILED,
                                msg,
                                error_details=msg,
                            )
                            worker_state["last_error"] = msg
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
                            worker_state["last_error"] = str(nae)
                            # Break out of item loop to stop processing
                            pause_requested = True
                            break
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


@app.route("/cli/health")
def cli_health():
    """Return health for CLI-based agents (codex, gemini)."""

    return jsonify({"providers": check_cli_health()})


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
        {
            "message": "Reloaded config",
            "poll_interval": worker_state.get("poll_interval"),
        }
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

        # Set poll interval from DB-backed worker runtime settings if available
        if config_loader:
            try:
                worker_settings = config_loader.get_worker_settings()
                runtime = (
                    worker_settings.get("runtime", {}) if isinstance(worker_settings, dict) else {}
                )
                worker_state["poll_interval"] = runtime.get("pollIntervalSeconds", 60)
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
