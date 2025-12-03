#!/usr/bin/env python3
"""Lightweight queue processor entrypoint used by the Docker container."""

from __future__ import annotations

import logging
import os
import time
import signal

from job_finder.flask_worker import initialize_components, load_config
from job_finder.job_queue.config_loader import ConfigLoader
from job_finder.exceptions import InitializationError, ConfigurationError


logger = logging.getLogger("queue_worker")
logging.basicConfig(
    level=os.getenv("QUEUE_WORKER_LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(message)s",
)

POLL_INTERVAL = int(os.getenv("QUEUE_POLL_INTERVAL", "60"))
BATCH_SIZE = int(os.getenv("QUEUE_BATCH_SIZE", "10"))
RUNNING = True


def handle_signal(signum: int, _frame) -> None:
    global RUNNING
    logger.info("Received signal %s; stopping queue worker loop", signum)
    RUNNING = False


def main() -> None:
    config = load_config()
    queue_manager, processor, _ = initialize_components(config)
    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    # Load queue settings for task delay
    # Use same ENV variable precedence as initialize_components()
    db_path = os.getenv("SQLITE_DB_PATH") or os.getenv("DATABASE_PATH")
    config_loader = ConfigLoader(db_path)

    # Get task delay from settings (default to 1 second) with validation
    try:
        worker_settings = config_loader.get_worker_settings()
        runtime = worker_settings.get("runtime", {}) if isinstance(worker_settings, dict) else {}
        task_delay_raw = runtime.get("taskDelaySeconds", 1)

        # Validate taskDelaySeconds is a valid number
        try:
            task_delay = float(task_delay_raw)
            # Ensure it's within reasonable bounds (0 to 60 seconds)
            if task_delay < 0:
                logger.warning(
                    "Invalid taskDelaySeconds=%s (negative), using default of 1s",
                    task_delay_raw,
                )
                task_delay = 1
            elif task_delay > 60:
                logger.warning(
                    "taskDelaySeconds=%s exceeds maximum of 60s, capping at 60s",
                    task_delay_raw,
                )
                task_delay = 60
        except (TypeError, ValueError):
            logger.warning(
                "Invalid taskDelaySeconds=%s (not a number), using default of 1s",
                task_delay_raw,
            )
            task_delay = 1
    except (InitializationError, ConfigurationError) as e:
        # Expected errors: database not initialized, config missing, etc.
        logger.warning(
            "Could not load worker runtime settings (%s: %s), using default task delay of 1s",
            type(e).__name__,
            e,
        )
        task_delay = 1
    except Exception:
        # Unexpected errors - log full traceback for debugging
        logger.exception("Unexpected error loading queue settings, using default task delay of 1s")
        task_delay = 1

    logger.info(
        "Queue worker started (poll_interval=%ss, batch_size=%s, task_delay=%ss)",
        POLL_INTERVAL,
        BATCH_SIZE,
        task_delay,
    )

    while RUNNING:
        try:
            items = queue_manager.get_pending_items(limit=BATCH_SIZE)
            if not items:
                logger.debug("No pending items. Sleeping for %ss", POLL_INTERVAL)
                time.sleep(POLL_INTERVAL)
                continue

            logger.info("Processing %s queue items", len(items))
            for i, item in enumerate(items):
                if not RUNNING:
                    break
                try:
                    processor.process_item(item)

                    # Add delay between tasks (except after the last item)
                    if task_delay > 0 and i < len(items) - 1:
                        time.sleep(task_delay)

                except Exception:  # pragma: no cover - defensive logging
                    logger.exception("Failed processing item %s", item.id)

        except Exception:  # pragma: no cover - defensive logging
            logger.exception("Unhandled queue loop error")
            time.sleep(POLL_INTERVAL)

    logger.info("Queue worker stopped")


if __name__ == "__main__":
    main()
