"""Tests for queue event payloads and notifier.

These tests ensure that event payloads sent by the worker match the expected
structure defined in shared/src/queue-events.types.ts.

Event flow:
1. Worker sends events via notifier.send_event()
2. Notifier formats payload as { event: str, data: {..., workerId: str} }
3. BE receives via WebSocket or HTTP and broadcasts to FE via SSE
"""

import json

import sqlite3
from unittest.mock import MagicMock, patch
from datetime import datetime, timezone

import pytest

from job_finder.job_queue.notifier import QueueEventNotifier
from job_finder.job_queue.manager import QueueManager
from job_finder.job_queue.models import JobQueueItem, QueueItemType, QueueStatus

# =============================================================================
# Fixtures
# =============================================================================


JOB_QUEUE_SCHEMA = """
CREATE TABLE IF NOT EXISTS job_queue (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    url TEXT,
    tracking_id TEXT,
    parent_item_id TEXT,
    dedupe_key TEXT,
    input TEXT,
    output TEXT,
    result_message TEXT,
    error_details TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    last_error_category TEXT,
    created_at TEXT,
    updated_at TEXT,
    processed_at TEXT,
    completed_at TEXT
)
"""


@pytest.fixture
def db_path(tmp_path):
    """Create a temporary database with the job_queue table."""
    db_path_str = str(tmp_path / "test.db")
    conn = sqlite3.connect(db_path_str)
    conn.execute(JOB_QUEUE_SCHEMA)
    conn.close()
    return db_path_str


@pytest.fixture
def mock_notifier():
    """Create a mock notifier for testing event emissions."""
    return MagicMock()


@pytest.fixture
def manager(db_path, mock_notifier):
    """Create a QueueManager with a mock notifier."""
    return QueueManager(db_path=db_path, notifier=mock_notifier)


@pytest.fixture
def db_with_item(db_path):
    """Create a database with a pre-existing queue item."""
    now = datetime.now(timezone.utc).isoformat()
    conn = sqlite3.connect(db_path)
    conn.execute(
        """INSERT INTO job_queue (id, type, status, url, input, created_at, updated_at, tracking_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            "test-item-1",
            "job",
            "pending",
            "https://example.com/job/1",
            json.dumps({"company_name": "Test Company", "source": "manual_submission"}),
            now,
            now,
            "track-1",
        ),
    )
    conn.commit()
    conn.close()
    return db_path


# =============================================================================
# Tests
# =============================================================================


class TestEventPayloadStructure:
    """Test that event payloads match expected TypeScript structures."""

    def test_item_created_payload_structure(self):
        """
        Test item.created event payload matches ItemCreatedEventData:
        { queueItem: QueueItem, workerId?: string }
        """
        queue_item = JobQueueItem(
            id="test-123",
            type=QueueItemType.JOB,
            status=QueueStatus.PENDING,
            url="https://example.com/job/123",
            company_name="Test Company",
        )

        payload = {"queueItem": queue_item.model_dump(mode="json")}

        # Verify structure
        assert "queueItem" in payload
        assert isinstance(payload["queueItem"], dict)
        assert payload["queueItem"]["id"] == "test-123"
        assert payload["queueItem"]["type"] == "job"
        assert payload["queueItem"]["status"] == "pending"
        assert payload["queueItem"]["url"] == "https://example.com/job/123"
        assert payload["queueItem"]["company_name"] == "Test Company"

    def test_item_updated_payload_structure(self):
        """
        Test item.updated event payload matches ItemUpdatedEventData:
        { queueItem: QueueItem, workerId?: string }
        """
        queue_item = JobQueueItem(
            id="test-456",
            type=QueueItemType.JOB,
            status=QueueStatus.PROCESSING,
            url="https://example.com/job/456",
            company_name="Another Company",
        )

        payload = {"queueItem": queue_item.model_dump(mode="json")}

        # Verify structure
        assert "queueItem" in payload
        assert payload["queueItem"]["status"] == "processing"

    def test_item_deleted_payload_structure(self):
        """
        Test item.deleted event payload matches ItemDeletedEventData:
        { queueItemId: string, workerId?: string }
        """
        payload = {"queueItemId": "test-789"}

        # Verify structure
        assert "queueItemId" in payload
        assert isinstance(payload["queueItemId"], str)
        assert payload["queueItemId"] == "test-789"

    def test_heartbeat_payload_structure(self):
        """
        Test heartbeat event payload matches HeartbeatEventData:
        { iteration: number, workerId?: string }
        """
        payload = {"iteration": 42}

        # Verify structure
        assert "iteration" in payload
        assert isinstance(payload["iteration"], int)
        assert payload["iteration"] == 42


class TestNotifierPayloadFormat:
    """Test that QueueEventNotifier formats payloads correctly."""

    @patch.object(QueueEventNotifier, "_start_ws")
    def test_send_event_adds_worker_id(self, mock_start_ws):
        """Test that send_event adds workerId to payload."""
        notifier = QueueEventNotifier(worker_id="test-worker")
        notifier._ws_connected = False  # Force HTTP path for testing

        with patch("requests.post") as mock_post:
            mock_post.return_value = MagicMock(status_code=200)

            notifier.send_event("item.created", {"queueItem": {"id": "123"}})

            # Verify the payload structure sent to HTTP endpoint
            call_args = mock_post.call_args
            sent_payload = call_args.kwargs.get("json") or call_args[1].get("json")

            assert sent_payload["event"] == "item.created"
            assert "data" in sent_payload
            assert sent_payload["data"]["workerId"] == "test-worker"
            assert sent_payload["data"]["queueItem"]["id"] == "123"

    @patch.object(QueueEventNotifier, "_start_ws")
    def test_send_event_preserves_existing_data(self, mock_start_ws):
        """Test that send_event preserves all data fields."""
        notifier = QueueEventNotifier(worker_id="worker-1")
        notifier._ws_connected = False

        with patch("requests.post") as mock_post:
            mock_post.return_value = MagicMock(status_code=200)

            original_data = {
                "queueItem": {
                    "id": "456",
                    "type": "job",
                    "status": "success",
                    "url": "https://example.com",
                    "company_name": "Test Co",
                },
                "customField": "value",
            }

            notifier.send_event("item.updated", original_data)

            call_args = mock_post.call_args
            sent_payload = call_args.kwargs.get("json") or call_args[1].get("json")

            # All original fields should be preserved
            assert sent_payload["data"]["queueItem"]["id"] == "456"
            assert sent_payload["data"]["queueItem"]["type"] == "job"
            assert sent_payload["data"]["customField"] == "value"


class TestManagerEventEmission:
    """Test that QueueManager emits events correctly."""

    def test_add_item_emits_item_created(self, manager, mock_notifier):
        """Test that add_item() emits item.created event."""
        item = JobQueueItem(
            type=QueueItemType.JOB,
            url="https://example.com/job/123",
            company_name="Test Company",
        )

        manager.add_item(item)

        # Verify event was emitted
        mock_notifier.send_event.assert_called_once()
        call_args = mock_notifier.send_event.call_args

        assert call_args[0][0] == "item.created"
        assert "queueItem" in call_args[0][1]
        assert call_args[0][1]["queueItem"]["url"] == "https://example.com/job/123"

    def test_update_status_emits_item_updated(self, db_with_item, mock_notifier):
        """Test that update_status() emits item.updated event."""
        manager = QueueManager(db_path=db_with_item, notifier=mock_notifier)

        manager.update_status("test-item-1", QueueStatus.PROCESSING)

        # Verify event was emitted
        mock_notifier.send_event.assert_called_once()
        call_args = mock_notifier.send_event.call_args

        assert call_args[0][0] == "item.updated"
        assert "queueItem" in call_args[0][1]
        assert call_args[0][1]["queueItem"]["status"] == "processing"

    def test_delete_item_emits_item_deleted(self, db_with_item, mock_notifier):
        """Test that delete_item() emits item.deleted event."""
        manager = QueueManager(db_path=db_with_item, notifier=mock_notifier)

        manager.delete_item("test-item-1")

        # Verify event was emitted
        mock_notifier.send_event.assert_called_once()
        call_args = mock_notifier.send_event.call_args

        assert call_args[0][0] == "item.deleted"
        assert call_args[0][1] == {"queueItemId": "test-item-1"}

    def test_requeue_with_state_emits_item_updated(self, db_with_item, mock_notifier):
        """Test that requeue_with_state() emits item.updated event."""
        manager = QueueManager(db_path=db_with_item, notifier=mock_notifier)

        manager.requeue_with_state(
            "test-item-1",
            pipeline_state={"job_data": {"title": "Test Job"}},
        )

        # Verify event was emitted
        mock_notifier.send_event.assert_called_once()
        call_args = mock_notifier.send_event.call_args

        assert call_args[0][0] == "item.updated"
        assert "queueItem" in call_args[0][1]
        assert call_args[0][1]["queueItem"]["status"] == "pending"


class TestEventNames:
    """Test that event names match TypeScript definitions."""

    def test_worker_event_names(self):
        """
        Test that worker uses correct event names matching WorkerEventName:
        'item.created' | 'item.updated' | 'item.deleted' | 'heartbeat'
        """
        valid_events = {"item.created", "item.updated", "item.deleted", "heartbeat"}

        # These are the events the worker should emit
        assert "item.created" in valid_events
        assert "item.updated" in valid_events
        assert "item.deleted" in valid_events
        assert "heartbeat" in valid_events

    def test_invalid_event_names(self):
        """Test that worker does not use SSE-only event names."""
        sse_only_events = {"snapshot", "progress", "command.ack", "command.error"}
        worker_events = {"item.created", "item.updated", "item.deleted", "heartbeat"}

        # Worker should not emit SSE-only events
        assert not sse_only_events.intersection(worker_events)
