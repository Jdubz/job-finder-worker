#!/usr/bin/env python3
"""Lightweight queue processor entrypoint used by the Docker container."""

from __future__ import annotations

import logging
import os
import time
import signal

from job_finder.flask_worker import initialize_components, load_config
from job_finder.job_queue.config_loader import ConfigLoader


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
    db_path = os.getenv("JF_SQLITE_DB_PATH") or os.getenv("SQLITE_DB_PATH")
    config_loader = ConfigLoader(db_path)

    # Get task delay from settings (default to 1 second)
    try:
        queue_settings = config_loader.get_queue_settings()
        task_delay = queue_settings.get("taskDelaySeconds", 1)
    except Exception:
        logger.warning("Could not load queue settings, using default task delay of 1s")
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
