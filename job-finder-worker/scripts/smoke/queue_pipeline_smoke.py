"""Lightweight smoke-test runner for the job ingestion pipeline."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence

REQUIRED_FIELDS = {
    "title",
    "company",
    "company_website",
    "location",
    "description",
    "url",
}


@dataclass
class SmokeTestRunner:
    """Loads canned fixtures and optionally submits them to the queue."""

    env: str
    fixtures_dir: str
    output_dir: str
    dry_run: bool = False
    database_name: str = field(init=False)
    queue_manager: Any = field(default=None, init=False)
    job_storage: Any = field(default=None, init=False)
    scraper_intake: Any = field(default=None, init=False)
    submitted_jobs: List[Dict[str, Any]] = field(default_factory=list, init=False)

    def __post_init__(self) -> None:
        self.fixtures_path = Path(self.fixtures_dir)
        self.output_path = Path(self.output_dir)
        self.database_name = (
            "portfolio" if self.env == "production" else "portfolio-staging"
        )

    # ------------------------------------------------------------------ loading
    def load_fixtures(self) -> List[Dict[str, Any]]:
        """Load all valid JSON fixtures from ``fixtures_dir``."""
        if not self.fixtures_path.exists():
            raise FileNotFoundError(
                f"Fixtures directory not found: {self.fixtures_path}"
            )

        fixtures: List[Dict[str, Any]] = []

        for file in sorted(self.fixtures_path.glob("*.json")):
            try:
                data = json.loads(file.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue  # Skip malformed files

            if not REQUIRED_FIELDS.issubset(data):
                continue  # Skip incomplete fixtures

            payload = dict(data)
            payload["_fixture_file"] = file.name
            fixtures.append(payload)

        return fixtures

    # ---------------------------------------------------------------- submission
    def submit_jobs(self, jobs: Sequence[Dict[str, Any]]) -> int:
        """
        Submit jobs to the queue.

        In dry-run mode we only return the number of jobs that would be submitted.
        """
        if not jobs:
            return 0

        if self.dry_run or self.scraper_intake is None:
            return len(jobs)

        for job in jobs:
            self.scraper_intake.submit(job)
            self.submitted_jobs.append(job)

        return len(jobs)

    # ---------------------------------------------------------------- validation
    def validate_results(self, results: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
        """Simple validation helpers for downstream smoke assertions."""
        seen_urls: Dict[str, int] = {}
        duplicate_details: List[Dict[str, Any]] = []
        failing_results: List[Dict[str, Any]] = []

        for index, result in enumerate(results):
            raw_url = result.get("url") or ""
            normalized_url = raw_url.rstrip("/")
            status = result.get("status")

            if normalized_url in seen_urls:
                duplicate_details.append(
                    {
                        "url": normalized_url,
                        "first_index": seen_urls[normalized_url],
                        "duplicate_index": index,
                    }
                )
            else:
                seen_urls[normalized_url] = index

            if status not in {"SUCCESS", "COMPLETED", "OK"}:
                failing_results.append(result)

        duplicate_check = {
            "passed": len(duplicate_details) == 0,
            "details": duplicate_details,
        }
        status_check = {
            "passed": len(failing_results) == 0,
            "failures": failing_results,
        }

        return {
            "passed": duplicate_check["passed"] and status_check["passed"],
            "checks": {
                "duplicate_urls": duplicate_check,
                "statuses": status_check,
            },
        }

    # ---------------------------------------------------------------- reporting
    def generate_report(
        self, results: Sequence[Dict[str, Any]], validation: Dict[str, Any]
    ) -> tuple[str, str]:
        """Persist a markdown and JSON report of the smoke test run."""
        self.output_path.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        markdown_path = self.output_path / f"smoke-report-{timestamp}.md"
        json_path = self.output_path / f"smoke-report-{timestamp}.json"

        total_jobs = len(self.submitted_jobs)
        failed = [
            r for r in results if r.get("status") not in {"SUCCESS", "COMPLETED", "OK"}
        ]
        overall_passed = validation.get("passed", False) and not failed
        status_label = "✅ PASSED" if overall_passed else "❌ FAILED"

        lines = [
            "# Queue Pipeline Smoke Test Report",
            "",
            f"- Environment: **{self.env}**",
            f"- Database: **{self.database_name}**",
            f"- Generated: {timestamp} UTC",
            f"- Result: {status_label}",
            "",
            "## Validation Summary",
        ]

        if validation.get("issues"):
            lines.append("### Issues")
            for issue in validation["issues"]:
                lines.append(f"- {issue}")
        else:
            lines.append("- No validation issues reported.")

        checks = validation.get("checks") or {}
        if checks:
            lines.append("")
            lines.append("### Checks")
            for name, details in checks.items():
                check_icon = "✅" if details.get("passed") else "❌"
                human_name = name.replace("_", " ").title()
                lines.append(f"- {check_icon} {human_name}")
                for detail in details.get("details", []):
                    lines.append(f"  - {detail}")

        lines.append("")
        lines.append("## Processed Jobs")
        if results:
            for result in results:
                company = result.get("company_name", "Unknown Company")
                url = result.get("url", "N/A")
                status = result.get("status", "UNKNOWN")
                lines.append(f"- {company} — {status} — {url}")
        else:
            lines.append("- No job results returned.")

        markdown_path.write_text("\n".join(lines), encoding="utf-8")

        report_payload = {
            "metadata": {
                "environment": self.env,
                "database": self.database_name,
                "generated_at": timestamp,
            },
            "summary": {
                "total_jobs": total_jobs,
                "results_returned": len(results),
                "failed_results": len(failed),
                "overall_passed": overall_passed,
            },
            "validation": validation,
            "results": list(results),
        }
        json_path.write_text(json.dumps(report_payload, indent=2), encoding="utf-8")

        return str(markdown_path), str(json_path)
