"""Tests for job processor company-enrichment spawning and dependency handling.

These tests verify that:
1. Company enrichment tasks are only spawned when needed
2. has_company_task is called with BOTH company_id AND company_name
3. Duplicate tasks are correctly prevented via OR logic

Bug History (2024-12): has_company_task used AND logic which allowed duplicates
when company_id changed between job submissions. Fixed to use OR logic.
"""

from unittest.mock import MagicMock, patch

from job_finder.job_queue.models import JobQueueItem, ProcessorContext, QueueItemType
from job_finder.job_queue.processors.job_processor import JobProcessor, PipelineContext


def _make_job_processor():
    qm = MagicMock()
    cl = MagicMock()
    cl.get_prefilter_policy.return_value = {
        "title": {"requiredKeywords": [], "excludedKeywords": []},
        "freshness": {"maxAgeDays": 0},
        "workArrangement": {
            "allowRemote": True,
            "allowHybrid": True,
            "allowOnsite": True,
            "willRelocate": True,
            "userLocation": "Portland, OR",
        },
    }
    js = MagicMock()
    jls = MagicMock()
    comp = MagicMock()
    srcs = MagicMock()
    cif = MagicMock()
    ai_matcher = MagicMock()

    # Minimal methods used in these tests
    def nop():
        return None

    with patch(
        "job_finder.job_queue.processors.job_processor.AgentManager",
        return_value=MagicMock(),
    ):
        ctx = ProcessorContext(
            queue_manager=qm,
            config_loader=cl,
            job_storage=js,
            job_listing_storage=jls,
            companies_manager=comp,
            sources_manager=srcs,
            company_info_fetcher=cif,
            ai_matcher=ai_matcher,
            notifier=None,
        )
        processor = JobProcessor(ctx)

    processor._refresh_runtime_config = nop  # avoid overwriting mocks
    return processor, qm, comp


def _ctx(company_id="c1", company_name="Acme", wait_count=0):
    item = JobQueueItem(
        id="job-1",
        type=QueueItemType.JOB,
        url="https://example.com/job/1",
        company_name=company_name,
        tracking_id="t-1",
    )
    job_data = {"company": company_name, "company_id": company_id}
    company_data = {"id": company_id, "about": "", "culture": ""}
    state = {"company_wait_count": wait_count, "job_data": job_data}
    ctx = PipelineContext(item=item, job_data=job_data, company_data=company_data, listing_id=None)
    return ctx, state


def test_spawn_company_enrichment_when_sparse_and_no_active_task():
    jp, qm, comp = _make_job_processor()
    ctx, _ = _ctx()

    comp.has_good_company_data.return_value = False
    qm.has_company_task.return_value = False
    qm.spawn_item_safely.return_value = "co-1"

    jp._spawn_company_enrichment(ctx)

    qm.spawn_item_safely.assert_called_once()
    args = qm.spawn_item_safely.call_args.kwargs["new_item_data"]
    assert args["type"] == QueueItemType.COMPANY
    assert args["company_id"] == "c1"


def test_skip_company_enrichment_when_good_data():
    jp, qm, comp = _make_job_processor()
    ctx, _ = _ctx()

    comp.has_good_company_data.return_value = True

    jp._spawn_company_enrichment(ctx)

    qm.spawn_item_safely.assert_not_called()


def test_skip_company_enrichment_when_active_task_exists():
    jp, qm, comp = _make_job_processor()
    ctx, _ = _ctx()

    comp.has_good_company_data.return_value = False
    qm.has_company_task.return_value = True

    jp._spawn_company_enrichment(ctx)

    qm.spawn_item_safely.assert_not_called()


def test_check_company_dependency_requeues_and_waits():
    jp, qm, comp = _make_job_processor()
    ctx, state = _ctx(wait_count=0)

    comp.has_good_company_data.return_value = False
    qm.has_company_task.return_value = False

    proceed = jp._check_company_dependency(ctx, state)

    assert proceed is False
    qm.requeue_with_state.assert_called_once()


def test_check_company_dependency_proceeds_after_max_waits():
    jp, qm, comp = _make_job_processor()
    ctx, state = _ctx(wait_count=3)

    comp.has_good_company_data.return_value = False

    proceed = jp._check_company_dependency(ctx, state)

    assert proceed is True
    qm.requeue_with_state.assert_not_called()


# ============================================================================
# REGRESSION TESTS: Verify has_company_task is called with correct parameters
# ============================================================================


def test_spawn_company_passes_both_id_and_name_to_has_company_task():
    """Verify _spawn_company_enrichment passes BOTH company_id AND company_name.

    This is critical for the OR logic fix - if only one parameter is passed,
    the deduplication won't work correctly across different scenarios.
    """
    jp, qm, comp = _make_job_processor()
    ctx, _ = _ctx(company_id="test-id-123", company_name="TestCompany")

    comp.has_good_company_data.return_value = False
    qm.has_company_task.return_value = False
    qm.spawn_item_safely.return_value = "spawned-task"

    jp._spawn_company_enrichment(ctx)

    # Verify has_company_task was called with BOTH company_id AND company_name
    qm.has_company_task.assert_called_once()
    call_args = qm.has_company_task.call_args

    # Check positional and keyword args
    assert call_args[0][0] == "test-id-123"  # company_id as first positional arg
    assert call_args[1]["company_name"] == "TestCompany"  # company_name as kwarg


def test_spawn_company_passes_name_even_without_id():
    """Verify company_name is passed even when company_id is missing.

    When a company stub hasn't been created yet, we only have the name.
    The OR logic ensures this still blocks duplicate spawns.
    """
    jp, qm, comp = _make_job_processor()

    # Context with no company_id (company lookup didn't find/create one)
    item = JobQueueItem(
        id="job-no-id",
        type=QueueItemType.JOB,
        url="https://example.com/job/no-id",
        company_name="NameOnlyCompany",
        tracking_id="t-no-id",
    )
    job_data = {"company": "NameOnlyCompany"}
    company_data = {"name": "NameOnlyCompany"}  # No "id" field
    ctx = PipelineContext(item=item, job_data=job_data, company_data=company_data)

    comp.has_good_company_data.return_value = False
    comp.get_company.return_value = None  # No existing company found
    qm.has_company_task.return_value = False
    qm.spawn_item_safely.return_value = "spawned-task"

    jp._spawn_company_enrichment(ctx)

    # Verify has_company_task was called - company_name should still be passed
    qm.has_company_task.assert_called()
    call_args = qm.has_company_task.call_args
    assert call_args[1]["company_name"] == "NameOnlyCompany"


def test_spawn_company_blocked_when_task_exists_by_name():
    """Verify spawn is blocked when has_company_task returns True.

    This simulates the scenario where a task exists for the same company name
    but with a different (or no) company_id.
    """
    jp, qm, comp = _make_job_processor()
    ctx, _ = _ctx(company_id="new-stub-id", company_name="ExistingTaskCompany")

    comp.has_good_company_data.return_value = False
    qm.has_company_task.return_value = True  # Task already exists

    jp._spawn_company_enrichment(ctx)

    # spawn_item_safely should NOT be called because has_company_task returned True
    qm.spawn_item_safely.assert_not_called()


def test_spawn_company_resolves_existing_by_name():
    """Verify company lookup by name when company_id is missing from context.

    The _spawn_company_enrichment method should attempt to find an existing
    company by name when the context doesn't have a company_id.
    """
    jp, qm, comp = _make_job_processor()

    # Context with company data that has no id
    item = JobQueueItem(
        id="job-resolve",
        type=QueueItemType.JOB,
        url="https://example.com/job/resolve",
        company_name="ResolveCompany",
        tracking_id="t-resolve",
    )
    job_data = {"company": "ResolveCompany"}
    company_data = {"name": "ResolveCompany"}  # No "id" field initially
    ctx = PipelineContext(item=item, job_data=job_data, company_data=company_data)

    # get_company returns existing company with id
    existing_company = {"id": "resolved-id", "name": "ResolveCompany", "about": "stuff"}
    comp.get_company.return_value = existing_company
    comp.has_good_company_data.return_value = False
    qm.has_company_task.return_value = False
    qm.spawn_item_safely.return_value = "spawned-task"

    jp._spawn_company_enrichment(ctx)

    # Verify get_company was called to resolve by name
    comp.get_company.assert_called_once_with("ResolveCompany")

    # Verify has_company_task was called with the resolved id
    call_args = qm.has_company_task.call_args
    assert call_args[0][0] == "resolved-id"
    assert call_args[1]["company_name"] == "ResolveCompany"
