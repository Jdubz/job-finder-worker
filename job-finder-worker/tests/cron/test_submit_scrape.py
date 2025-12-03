import json
import sqlite3

import pytest

from job_finder.cron import submit_scrape


JOB_QUEUE_SCHEMA = """
CREATE TABLE job_queue (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    url TEXT,
    tracking_id TEXT,
    parent_item_id TEXT,
    input TEXT,
    output TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    processed_at TEXT,
    completed_at TEXT,
    result_message TEXT,
    error_details TEXT
);
"""


JOB_FINDER_CONFIG_SCHEMA = """
CREATE TABLE job_finder_config (
    id TEXT PRIMARY KEY,
    payload_json TEXT NOT NULL,
    updated_at TEXT,
    updated_by TEXT
);
"""


def _create_db(tmp_path):
    db_path = tmp_path / "submit_scrape.db"
    conn = sqlite3.connect(db_path)
    conn.execute(JOB_QUEUE_SCHEMA)
    conn.execute(JOB_FINDER_CONFIG_SCHEMA)
    conn.commit()
    conn.close()
    return str(db_path)


def _fetch_queue_rows(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM job_queue").fetchall()
    conn.close()
    return rows


def _set_worker_runtime(db_path, settings):
    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        INSERT INTO job_finder_config (id, payload_json)
        VALUES ('worker-settings', ?)
        """,
        (json.dumps(settings),),
    )
    conn.commit()
    conn.close()


def test_submit_scrape_enqueues_item(tmp_path, capsys):
    db_path = _create_db(tmp_path)
    _set_worker_runtime(
        db_path,
        {
            "scraping": {"requestTimeoutSeconds": 30, "maxHtmlSampleLength": 1000},
            "textLimits": {
                "minCompanyPageLength": 10,
                "minSparseCompanyInfoLength": 5,
                "maxIntakeTextLength": 500,
                "maxIntakeDescriptionLength": 2000,
                "maxIntakeFieldLength": 400,
                "maxDescriptionPreviewLength": 500,
                "maxCompanyInfoTextLength": 1000,
            },
            "runtime": {
                "processingTimeoutSeconds": 1800,
                "isProcessingEnabled": True,
                "taskDelaySeconds": 0,
                "pollIntervalSeconds": 10,
                "scrapeConfig": {},
            },
        },
    )

    exit_code = submit_scrape.main(
        [
            "--db-path",
            db_path,
            "--target-matches",
            "5",
            "--max-sources",
            "3",
            "--source-ids",
            "abc,def",
        ]
    )

    assert exit_code == 0

    rows = _fetch_queue_rows(db_path)
    assert len(rows) == 1

    row = rows[0]
    assert row["type"] == "scrape"
    assert row["status"] == "pending"

    input_payload = json.loads(row["input"])
    assert input_payload["source"] == "automated_scan"

    scrape_config = input_payload["scrape_config"]
    assert scrape_config["target_matches"] == 5
    assert scrape_config["max_sources"] == 3
    assert scrape_config["source_ids"] == ["abc", "def"]

    # Cron log line is JSON and includes event name
    stdout = capsys.readouterr().out.strip().splitlines()
    assert stdout, "expected JSON log on stdout"
    log_line = json.loads(stdout[-1])
    assert log_line["event"] == "cron_scrape_enqueued"
    assert log_line["item_id"] == row["id"]


def test_submit_scrape_seeds_defaults_when_config_missing(tmp_path):
    db_path = _create_db(tmp_path)

    # Worker runtime config is required; legacy scheduler config is removed
    with pytest.raises(Exception):
        submit_scrape.main(["--db-path", db_path])


def test_submit_scrape_uses_db_config_as_fallback(tmp_path):
    db_path = _create_db(tmp_path)

    db_settings = {
        "scrapeConfig": {
            "targetMatches": 10,
            "maxSources": 5,
            "sourceIds": ["db_src_1", "db_src_2"],
        }
    }
    _set_scheduler_settings(db_path, db_settings)

    submit_scrape.main(["--db-path", db_path])

    rows = _fetch_queue_rows(db_path)
    assert len(rows) == 1

    input_payload = json.loads(rows[0]["input"])
    scrape_config = input_payload["scrape_config"]
    assert scrape_config["target_matches"] == 10
    assert scrape_config["max_sources"] == 5
    assert scrape_config["source_ids"] == ["db_src_1", "db_src_2"]
