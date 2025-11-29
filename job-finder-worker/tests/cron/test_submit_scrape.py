import json
import sqlite3

from job_finder.cron import submit_scrape


JOB_QUEUE_SCHEMA = """
CREATE TABLE job_queue (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '',
    company_name TEXT NOT NULL DEFAULT '',
    company_id TEXT,
    source TEXT,
    submitted_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    processed_at TEXT,
    completed_at TEXT,
    scraped_data TEXT,
    scrape_config TEXT,
    source_discovery_config TEXT,
    source_id TEXT,
    source_type TEXT,
    source_config TEXT,
    source_tier TEXT,
    pipeline_state TEXT,
    parent_item_id TEXT,
    company_sub_task TEXT,
    tracking_id TEXT,
    result_message TEXT,
    error_details TEXT,
    metadata TEXT
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


def test_submit_scrape_enqueues_item(tmp_path, capsys):
    db_path = _create_db(tmp_path)

    exit_code = submit_scrape.main(
        [
            "--db-path",
            db_path,
            "--target-matches",
            "5",
            "--max-sources",
            "3",
            "--min-match-score",
            "70",
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
    assert row["source"] == "automated_scan"

    scrape_config = json.loads(row["scrape_config"])
    assert scrape_config["target_matches"] == 5
    assert scrape_config["max_sources"] == 3
    assert scrape_config["min_match_score"] == 70
    assert scrape_config["source_ids"] == ["abc", "def"]

    # Cron log line is JSON and includes event name
    stdout = capsys.readouterr().out.strip().splitlines()
    assert stdout, "expected JSON log on stdout"
    log_line = json.loads(stdout[-1])
    assert log_line["event"] == "cron_scrape_enqueued"
    assert log_line["item_id"] == row["id"]


def test_submit_scrape_seeds_defaults_when_config_missing(tmp_path):
    db_path = _create_db(tmp_path)

    # No scheduler-settings row; should seed defaults and still enqueue
    submit_scrape.main(["--db-path", db_path])

    rows = _fetch_queue_rows(db_path)
    assert len(rows) == 1

    scrape_config = json.loads(rows[0]["scrape_config"])
    # Defaults are all None when not set
    assert scrape_config["target_matches"] is None
    assert scrape_config["max_sources"] is None
    assert scrape_config["min_match_score"] is None
    assert scrape_config["source_ids"] is None
