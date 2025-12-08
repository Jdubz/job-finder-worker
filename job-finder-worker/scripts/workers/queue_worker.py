#!/usr/bin/env python3
"""Lightweight queue processor entrypoint used by the Docker container."""

from __future__ import annotations

import concurrent.futures
import logging
import os
import time
import signal
import traceback

from job_finder.flask_worker import initialize_components, load_config
from job_finder.exceptions import InitializationError, ConfigurationError, NoAgentsAvailableError
from job_finder.job_queue.models import QueueStatus


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
    queue_manager, processor, config_loader, _, _ = initialize_components(config)
    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    # Get task delay and processing timeout from config_loader (centralized validation)
    try:
        task_delay = config_loader.get_task_delay()
    except (InitializationError, ConfigurationError) as e:
        logger.warning(
            "Could not load task delay (%s: %s), using default of 1s",
            type(e).__name__,
            e,
        )
        task_delay = 1.0
    except Exception:
        logger.exception("Unexpected error loading task delay, using default of 1s")
        task_delay = 1.0

    try:
        processing_timeout = config_loader.get_processing_timeout()
    except (InitializationError, ConfigurationError):
        processing_timeout = 1800  # Default 30 minutes
        logger.warning(
            "Could not load processing timeout, using default of %ss", processing_timeout
        )

    logger.info(
        "Queue worker started (poll_interval=%ss, batch_size=%s, task_delay=%ss, timeout=%ss)",
        POLL_INTERVAL,
        BATCH_SIZE,
        task_delay,
        processing_timeout,
    )

    # Use ThreadPoolExecutor for timeout enforcement (single worker to maintain serial processing)
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
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
                        # Submit task with timeout enforcement
                        future = executor.submit(processor.process_item, item)
                        future.result(timeout=processing_timeout)

                        # Add delay between tasks (except after the last item)
                        if task_delay > 0 and i < len(items) - 1:
                            time.sleep(task_delay)

                    except concurrent.futures.TimeoutError:
                        error_msg = f"Processing exceeded timeout ({processing_timeout}s)"
                        logger.error("Item %s timed out: %s", item.id, error_msg)
                        queue_manager.update_status(
                            item.id,
                            QueueStatus.FAILED,
                            error_msg,
                            error_details=error_msg,
                        )

                    except NoAgentsAvailableError as e:
                        # Critical: no agents available - reset item and stop processing
                        logger.error(
                            "No agents available for item %s (task_type=%s, tried=%s)",
                            item.id,
                            e.task_type,
                            e.tried_agents,
                        )
                        queue_manager.update_status(
                            item.id,
                            QueueStatus.PENDING,
                            f"Reset to pending: no agents available for {e.task_type}",
                        )
                        # Stop processing until agents are available
                        logger.warning("Stopping queue processing: no agents available")
                        config_loader.set_processing_disabled_with_reason(str(e))
                        break

                    except Exception:
                        # Mark item as failed with full traceback
                        error_msg = traceback.format_exc()
                        logger.exception("Failed processing item %s", item.id)
                        queue_manager.update_status(
                            item.id,
                            QueueStatus.FAILED,
                            "Processing failed - see error details",
                            error_details=error_msg,
                        )

            except Exception:  # pragma: no cover - defensive logging
                logger.exception("Unhandled queue loop error")
                time.sleep(POLL_INTERVAL)

    logger.info("Queue worker stopped")


if __name__ == "__main__":
    main()
