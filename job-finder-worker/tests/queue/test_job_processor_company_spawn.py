"""Tests for job processor company-enrichment spawning and dependency handling."""

from unittest.mock import MagicMock, patch

import pytest

from job_finder.job_queue.models import JobQueueItem, QueueItemType
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
        "job_finder.job_queue.processors.job_processor.create_provider_from_config",
        return_value=MagicMock(),
    ):
        processor = JobProcessor(
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
