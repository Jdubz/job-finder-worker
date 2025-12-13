import datetime

from job_finder.job_queue.manager import _rows_to_items


def _base_row(**overrides):
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    row = {
        "id": "row-1",
        "type": "job",
        "status": "pending",
        "url": "https://example.com/job",
        "tracking_id": None,
        "parent_item_id": None,
        "input": "{}",
        "output": "{}",
        "result_message": None,
        "error_details": None,
        "created_at": now,
        "updated_at": now,
        "processed_at": None,
        "completed_at": None,
        "dedupe_key": None,
    }
    row.update(overrides)
    return row


def _as_row(mapping):
    # sqlite3.Row supports dict(row), SimpleNamespace does not. Use a simple object with __iter__.
    return type("Row", (dict,), {})(mapping)


def test_rows_to_items_backfills_tracking_id_from_id():
    rows = [_as_row(_base_row(tracking_id=None, id="abc"))]
    items = _rows_to_items(rows)
    assert len(items) == 1
    assert items[0].tracking_id == "abc"


def test_rows_to_items_drops_row_missing_id_and_tracking():
    rows = [_as_row(_base_row(tracking_id=None, id=None))]
    items = _rows_to_items(rows)
    assert items == []


def test_rows_to_items_drops_malformed_row():
    # Invalid status triggers ValueError in JobQueueItem.from_record
    rows = [_as_row(_base_row(status="not-a-status", id="bad", tracking_id=None))]
    items = _rows_to_items(rows)
    assert items == []
