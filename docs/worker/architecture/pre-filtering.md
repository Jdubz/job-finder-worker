> Status: Active
> Owner: @jdubz
> Last Updated: 2025-11-25

# Job Pre-Filtering

Pre-filtering is applied **before** jobs are added to the queue, significantly reducing queue size and AI analysis costs.

## Overview

When jobs are scraped from sources (Greenhouse, RSS feeds, etc.), they pass through a pre-filter stage before being queued. This prevents obviously irrelevant jobs from consuming queue resources.

```
Scraper → Pre-Filter → Queue → AI Analysis → Job Matches
           ↓ (rejected)
        Discarded (not queued)
```

## What Gets Pre-Filtered

The pre-filter uses the same `StrikeFilterEngine` as the queue pipeline but runs it earlier. Jobs are rejected before queueing if they hit any **hard rejection** criteria:

| Filter | Description | Example |
|--------|-------------|---------|
| **Excluded Job Types** | Sales, HR, marketing, recruiting roles | "Account Executive", "Recruiter" |
| **Excluded Seniority** | Too junior positions | "Junior Developer", "Associate" |
| **Excluded Companies** | Blocklisted companies | Companies in stop list |
| **Excluded Keywords** | Deal-breaker keywords | "commission only", "mlm" |
| **Job Age** | Jobs older than 7 days | Posted 10 days ago |
| **Salary Floor** | Below minimum salary | Max salary < $100k |
| **Remote Policy** | Wrong work arrangement | On-site only (if not allowed) |

## Implementation

Pre-filtering is implemented in two key files:

### `scraper_intake.py`
```python
class ScraperIntake:
    def __init__(self, ..., filter_engine=None):
        self.filter_engine = filter_engine  # StrikeFilterEngine instance

    def submit_jobs(self, jobs, ...):
        for job in jobs:
            # Pre-filter before adding to queue
            if self.filter_engine:
                filter_result = self.filter_engine.evaluate_job(job)
                if not filter_result.passed:
                    # Job discarded - not queued
                    continue
            # Only add to queue if passed pre-filter
            self.queue_manager.add_item(...)
```

### `scrape_runner.py`
Creates the filter engine and passes it to ScraperIntake:
```python
class ScrapeRunner:
    def __init__(self, ..., filter_engine=None):
        self.filter_engine = filter_engine or self._create_filter_engine()
        self.scraper_intake = ScraperIntake(..., filter_engine=self.filter_engine)
```

## Benefits

1. **Reduced Queue Size**: Only relevant jobs enter the queue
2. **Lower AI Costs**: Fewer jobs need AI analysis
3. **Faster Processing**: Queue processes faster with fewer items
4. **Better Signal-to-Noise**: Queue contains higher-quality candidates

## Logging

Pre-filter stats are logged during scraping:

```
INFO  Submitted 45 jobs to queue from scraper | 650 duplicates | 744 pre-filtered
INFO    Pre-filter breakdown: Excluded job type: 320, Job too old: 280, Remote policy: 144
```

## Configuration

Pre-filter rules are configured in `job_finder_config` table under the `job-filters` key:

```json
{
  "enabled": true,
  "hardRejections": {
    "excludedJobTypes": ["sales", "hr", "recruiter", "marketing"],
    "excludedSeniority": ["junior", "entry level", "associate"],
    "excludedCompanies": ["company-to-avoid"],
    "excludedKeywords": ["commission only", "mlm"],
    "minSalaryFloor": 100000,
    "rejectCommissionOnly": true
  },
  "remotePolicy": {
    "allowRemote": true,
    "allowHybridPortland": true,
    "allowOnsite": false
  },
  "ageStrike": {
    "enabled": true,
    "rejectDays": 7
  }
}
```

## Strike System

Jobs that pass hard rejections may still accumulate **strikes** for soft issues:
- Low salary (< $150k) = 2 strikes
- Low experience requirement = 1 strike
- Non-ideal seniority = configurable
- Missing required tech = 1 strike
- Short description = 1 strike
- Job age > 1 day = 1 strike

Jobs with total strikes >= threshold (default 5) are filtered in the queue pipeline, **not** at pre-filter stage. This allows the AI to make the final call on borderline cases.

## Testing

Pre-filtering is tested via the existing `StrikeFilterEngine` tests in `tests/filters/test_strike_filter_engine.py`. The integration is tested in `tests/queue/test_scraper_intake.py`.
