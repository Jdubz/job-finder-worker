# GAP-TEST-WORKER-1 — Improve Test Coverage for Python Worker

- **Status**: To Do
- **Owner**: Worker A
- **Priority**: P1 (High)
- **Labels**: priority-p1, repository-worker, type-testing
- **Estimated Effort**: 2 days
- **Dependencies**: WORKER-WORKFLOW-1 (tests must block deployments)
- **Related**: Identified in comprehensive gap analysis

## What This Issue Covers

Improve test coverage for job-finder-worker Python application. While some tests exist, coverage is **incomplete** - critical job processing logic lacks comprehensive testing.

## Context

**Current State**:

- Some unit tests exist (basic structure)
- Tests don't block deployments (WORKER-WORKFLOW-1)
- Coverage is low (< 50% estimated)
- Missing integration tests
- No performance tests
- **Result**: Can deploy broken worker code to production

**Impact**:

- Worker failures in production
- Job processing bugs
- Data quality issues
- Cannot refactor confidently
- Difficult to debug failures

**Why This Is P1 High**:

- Worker is critical for job processing
- Bugs affect core functionality
- Tests should block deployments (once WORKER-WORKFLOW-1 done)
- Better tests = fewer production issues
- Enables confident refactoring

## Tasks

### 1. Improve Test Infrastructure

- [ ] Review current pytest configuration
- [ ] Add coverage reporting with pytest-cov
- [ ] Configure coverage thresholds (70%+)
- [ ] Add test fixtures for common scenarios
- [ ] Set up mock data generators

### 2. Comprehensive Unit Tests

- [ ] Test job scraping logic
- [ ] Test job parsing/extraction
- [ ] Test company matching algorithms
- [ ] Test data validation functions
- [ ] Test error handling
- [ ] Test retry logic
- [ ] Target: 70%+ code coverage

### 3. Integration Tests

- [ ] Test end-to-end job processing
- [ ] Test Firestore integration
- [ ] Test PubSub message handling
- [ ] Test API interactions
- [ ] Test Docker environment

### 4. Performance Tests

- [ ] Test job processing throughput
- [ ] Test memory usage
- [ ] Test concurrent job handling
- [ ] Test rate limiting
- [ ] Set performance benchmarks

### 5. Add Test Documentation

- [ ] Document test structure
- [ ] Add testing guide to README
- [ ] Document how to run tests locally
- [ ] Document mocking strategies
- [ ] Add troubleshooting guide

### 6. CI Integration Improvements

- [ ] Ensure tests run before Docker build
- [ ] Report coverage metrics
- [ ] Fail CI if coverage drops
- [ ] Add test performance monitoring

## Proposed Test Structure

```
job-finder-worker/
├── src/
│   ├── scraper/
│   │   ├── job_scraper.py
│   │   └── ...
│   ├── parser/
│   │   ├── job_parser.py
│   │   └── ...
│   └── utils/
│       └── ...
├── tests/
│   ├── unit/
│   │   ├── scraper/
│   │   │   ├── test_job_scraper.py
│   │   │   └── test_parser.py
│   │   ├── parser/
│   │   │   └── test_job_parser.py
│   │   └── utils/
│   │       └── test_helpers.py
│   ├── integration/
│   │   ├── test_job_processing_flow.py
│   │   ├── test_firestore_integration.py
│   │   └── test_pubsub_handling.py
│   ├── performance/
│   │   └── test_throughput.py
│   ├── fixtures/
│   │   ├── sample_jobs.py
│   │   └── mock_data.py
│   └── conftest.py                    # Shared fixtures
├── pytest.ini
└── .coveragerc
```

## Example Test Improvements

### pytest.ini

```ini
[pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts =
    --verbose
    --strict-markers
    --cov=src
    --cov-report=term-missing
    --cov-report=html
    --cov-report=xml
    --cov-fail-under=70
markers =
    unit: Unit tests
    integration: Integration tests
    performance: Performance tests
    slow: Slow running tests
```

### .coveragerc

```ini
[run]
source = src
omit =
    */tests/*
    */venv/*
    */__pycache__/*
    */site-packages/*

[report]
exclude_lines =
    pragma: no cover
    def __repr__
    raise AssertionError
    raise NotImplementedError
    if __name__ == .__main__.:
    if TYPE_CHECKING:
```

### Comprehensive Unit Test Example

```python
# tests/unit/scraper/test_job_scraper.py
import pytest
from unittest.mock import Mock, patch, MagicMock
from src.scraper.job_scraper import JobScraper
from src.models.job import Job

class TestJobScraper:
    @pytest.fixture
    def scraper(self):
        """Create JobScraper instance for testing"""
        return JobScraper()

    @pytest.fixture
    def sample_html(self):
        """Sample HTML response for testing"""
        return """
        <html>
            <div class="job-posting">
                <h1>Senior Software Engineer</h1>
                <span class="company">TechCorp</span>
                <div class="description">Build amazing things...</div>
            </div>
        </html>
        """

    def test_scrape_job_success(self, scraper, sample_html):
        """Test successful job scraping"""
        with patch('requests.get') as mock_get:
            mock_get.return_value.status_code = 200
            mock_get.return_value.text = sample_html

            job = scraper.scrape_job('https://example.com/job/123')

            assert job is not None
            assert job.title == 'Senior Software Engineer'
            assert job.company == 'TechCorp'
            assert 'Build amazing things' in job.description

    def test_scrape_job_handles_404(self, scraper):
        """Test handling of 404 responses"""
        with patch('requests.get') as mock_get:
            mock_get.return_value.status_code = 404

            with pytest.raises(JobNotFoundError):
                scraper.scrape_job('https://example.com/job/invalid')

    def test_scrape_job_handles_network_error(self, scraper):
        """Test handling of network errors"""
        with patch('requests.get') as mock_get:
            mock_get.side_effect = ConnectionError('Network error')

            with pytest.raises(ScrapingError):
                scraper.scrape_job('https://example.com/job/123')

    def test_scrape_job_handles_timeout(self, scraper):
        """Test handling of request timeouts"""
        with patch('requests.get') as mock_get:
            mock_get.side_effect = Timeout('Request timed out')

            with pytest.raises(ScrapingError):
                scraper.scrape_job('https://example.com/job/123')

    def test_scrape_job_respects_rate_limit(self, scraper, sample_html):
        """Test rate limiting between requests"""
        with patch('requests.get') as mock_get, \
             patch('time.sleep') as mock_sleep:
            mock_get.return_value.status_code = 200
            mock_get.return_value.text = sample_html

            scraper.scrape_job('https://example.com/job/1')
            scraper.scrape_job('https://example.com/job/2')

            # Should sleep between requests
            assert mock_sleep.called

    def test_scrape_job_extracts_all_fields(self, scraper, sample_html):
        """Test extraction of all job fields"""
        with patch('requests.get') as mock_get:
            mock_get.return_value.status_code = 200
            mock_get.return_value.text = sample_html

            job = scraper.scrape_job('https://example.com/job/123')

            # Verify all expected fields are extracted
            assert hasattr(job, 'title')
            assert hasattr(job, 'company')
            assert hasattr(job, 'description')
            assert hasattr(job, 'url')
            assert job.url == 'https://example.com/job/123'

    @pytest.mark.parametrize('invalid_html', [
        '',  # Empty
        '<html></html>',  # Missing content
        '<div>Random content</div>',  # Wrong structure
    ])
    def test_scrape_job_handles_invalid_html(self, scraper, invalid_html):
        """Test handling of various invalid HTML structures"""
        with patch('requests.get') as mock_get:
            mock_get.return_value.status_code = 200
            mock_get.return_value.text = invalid_html

            with pytest.raises(ParsingError):
                scraper.scrape_job('https://example.com/job/123')
```

### Integration Test Example

```python
# tests/integration/test_job_processing_flow.py
import pytest
from unittest.mock import patch
from src.worker import process_job_queue
from google.cloud import firestore

@pytest.mark.integration
class TestJobProcessingFlow:
    @pytest.fixture
    def firestore_client(self):
        """Create Firestore emulator client"""
        # Use Firestore emulator for integration tests
        return firestore.Client(project='test-project')

    def test_end_to_end_job_processing(self, firestore_client):
        """Test complete job processing pipeline"""
        # Arrange: Add job to queue
        job_ref = firestore_client.collection('job_queue').add({
            'url': 'https://example.com/job/123',
            'userId': 'test-user',
            'status': 'pending',
        })

        # Act: Process the job
        with patch('src.scraper.job_scraper.requests.get') as mock_get:
            mock_get.return_value.status_code = 200
            mock_get.return_value.text = '<html>...</html>'

            process_job_queue()

        # Assert: Job was processed and saved
        job_doc = job_ref[1].get()
        assert job_doc.exists
        data = job_doc.to_dict()
        assert data['status'] == 'processed'
        assert 'title' in data
        assert 'company' in data

    def test_job_processing_handles_failures(self, firestore_client):
        """Test error handling in job processing"""
        # Arrange: Add job with invalid URL
        job_ref = firestore_client.collection('job_queue').add({
            'url': 'https://invalid.example.com/job/999',
            'userId': 'test-user',
            'status': 'pending',
        })

        # Act: Process the job
        with patch('src.scraper.job_scraper.requests.get') as mock_get:
            mock_get.side_effect = ConnectionError('Failed')

            process_job_queue()

        # Assert: Job marked as failed
        job_doc = job_ref[1].get()
        data = job_doc.to_dict()
        assert data['status'] == 'failed'
        assert 'error' in data
```

### Performance Test Example

```python
# tests/performance/test_throughput.py
import pytest
import time
from src.worker import process_job_queue

@pytest.mark.performance
class TestPerformance:
    def test_job_processing_throughput(self, benchmark):
        """Test job processing speed"""
        # Benchmark should process at least 10 jobs/second
        result = benchmark(process_job_queue)
        assert result is not None

    def test_concurrent_job_processing(self):
        """Test processing multiple jobs concurrently"""
        start_time = time.time()

        # Process 100 jobs
        for i in range(100):
            process_job_queue()

        duration = time.time() - start_time

        # Should process 100 jobs in < 30 seconds
        assert duration < 30
        throughput = 100 / duration
        assert throughput > 3  # At least 3 jobs/second

    def test_memory_usage_stable(self):
        """Test memory usage doesn't grow unbounded"""
        import tracemalloc

        tracemalloc.start()
        baseline = tracemalloc.get_traced_memory()[0]

        # Process many jobs
        for i in range(1000):
            process_job_queue()

        current = tracemalloc.get_traced_memory()[0]
        tracemalloc.stop()

        # Memory growth should be reasonable (< 100MB)
        growth = current - baseline
        assert growth < 100 * 1024 * 1024  # 100 MB
```

## Acceptance Criteria

- [ ] Test coverage ≥ 70% (up from current ~50%)
- [ ] All critical paths have tests
- [ ] Integration tests cover main workflows
- [ ] Performance tests establish baselines
- [ ] Tests run in CI and block deployments
- [ ] All tests pass locally and in CI
- [ ] Test documentation complete
- [ ] No flaky tests

## Implementation Strategy

### Phase 1: Assessment (0.5 days)

- Analyze current test coverage
- Identify critical gaps
- Prioritize areas for testing
- Set coverage targets

### Phase 2: Unit Tests (1 day)

- Add comprehensive unit tests
- Test all business logic
- Test error handling
- Test edge cases
- Reach 70%+ coverage

### Phase 3: Integration Tests (0.5 days)

- Add end-to-end flow tests
- Test Firestore integration
- Test PubSub handling
- Test Docker environment

### Phase 4: Performance & Docs (0.5 days)

- Add performance tests
- Document test structure
- Update README
- Add troubleshooting guide

## Benefits

- **Confidence**: Deploy with confidence
- **Faster Debugging**: Tests pinpoint issues
- **Refactoring Safety**: Know when changes break things
- **Documentation**: Tests show how code works
- **Production Stability**: Fewer bugs reach production
- **Developer Experience**: Catch bugs early

## Dependencies Installation

```bash
cd job-finder-worker
pip install --upgrade \
  pytest \
  pytest-cov \
  pytest-benchmark \
  pytest-asyncio \
  pytest-mock \
  responses
```

## Related Issues

- WORKER-WORKFLOW-1: Tests must block deployments (P0 dependency)
- GAP-TEST-BE-1: Backend test coverage (similar approach)
- GAP-DEVOPS-MON-1: Monitor test metrics

## Testing Best Practices

### Unit Test Guidelines

1. Test one thing per test
2. Use descriptive test names
3. Follow Arrange-Act-Assert pattern
4. Mock external dependencies
5. Test edge cases and errors
6. Keep tests fast (< 1s each)

### Integration Test Guidelines

1. Use Firestore emulator
2. Clean up data after tests
3. Test realistic scenarios
4. Avoid external dependencies
5. Allow longer timeouts
6. Run separately from unit tests

### Performance Test Guidelines

1. Establish baselines
2. Run on consistent hardware
3. Monitor over time
4. Alert on regressions
5. Don't run in every CI build

## Notes

- Start with most critical code paths
- Aim for meaningful coverage, not 100%
- Write maintainable tests
- Review test quality in PRs
- Keep tests deterministic (no flakiness)
- Update tests when behavior changes
