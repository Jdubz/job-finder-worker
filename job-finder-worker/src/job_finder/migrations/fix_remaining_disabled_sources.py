"""
Second migration to fix remaining disabled/failed sources.

After the first migration (reenable_disabled_sources.py) recovered 35 sources,
48 remain disabled/failed. This migration fixes 35 sources, soft-deletes
14 defunct/unreachable sources, and leaves 0 unaddressed.

Tiers:
1. Verified API configs (3): Oracle HCM REST API, Workday
2. Lever API discovery (5): 1840 & Company, Rackspace, Qvest, Lumin Digital, Paradigm Health
3. Server-rendered HTML (8): JazzHR, Trakstar, SuccessFactors, custom SSR, WordPress
4. JS render pipeline (10): React SPA, Phenom, Angular, Webflow, Dayforce, ADP
5. URL/config fixes (3): URL corrections, re-enable, type fix
6. Ashby API discovery (2): Voodoo (103 jobs), Toggl (0 but account active)
7. Workable API discovery (2): Paymentology, Recruit 121 (0 but accounts active)
8. RecruiterBox API discovery (1): Sedron Technologies (8 jobs)

All new endpoints verified returning live data as of 2026-02-25.

Usage:
    python -m job_finder.migrations.fix_remaining_disabled_sources /path/to/database.db --dry-run
    python -m job_finder.migrations.fix_remaining_disabled_sources /path/to/database.db
"""

import json
import logging
import sqlite3
import sys
from datetime import datetime, timezone

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


# ── Config builders ──────────────────────────────────────────────────────

_WORKDAY_FIELDS = {
    "title": "title",
    "url": "externalPath",
    "location": "locationsText",
    "posted_date": "postedOn",
}


def _workday_config(
    tenant: str,
    wd_instance: str,
    site_id: str,
    company_name: str,
    limit: int = 20,
) -> dict:
    """Build a standard Workday POST API config."""
    return {
        "type": "api",
        "url": f"https://{tenant}.{wd_instance}.myworkdayjobs.com/wday/cxs/{tenant}/{site_id}/jobs",
        "method": "POST",
        "post_body": {"limit": limit, "offset": 0},
        "response_path": "jobPostings",
        "base_url": f"https://{tenant}.{wd_instance}.myworkdayjobs.com/{site_id}",
        "fields": _WORKDAY_FIELDS,
        "headers": {"Content-Type": "application/json"},
        "company_name": company_name,
    }


def _oracle_hcm_config(
    host: str,
    site_number: str,
    company_name: str,
    limit: int = 25,
) -> dict:
    """Build an Oracle HCM REST API config with url_template pagination.

    Oracle HCM embeds pagination in the finder parameter, so we use
    url_template with {offset} placeholder. The Id field returns a numeric
    requisition ID; the scraper str()-converts it and base_url prepends the
    career site path to form a clickable URL.
    """
    return {
        "type": "api",
        "url": (
            f"https://{host}/hcmRestApi/resources/latest/"
            f"recruitingCEJobRequisitions?onlyData=true"
            f"&finder=findReqs;siteNumber={site_number},"
            f"limit={limit},offset={{offset}}"
            f"&expand=requisitionList"
        ),
        "response_path": "items.0.requisitionList",
        "fields": {
            "title": "Title",
            "url": "Id",
            "location": "PrimaryLocation",
            "posted_date": "PostedDate",
            "description": "ShortDescriptionStr",
        },
        "company_name": company_name,
        "base_url": (f"https://{host}/hcmUI/CandidateExperience/en/sites/{site_number}/job/"),
        "pagination_type": "url_template",
        "page_size": limit,
        "max_pages": 100,
    }


def _lever_config(company_slug: str, company_name: str) -> dict:
    """Build a Lever API config."""
    return {
        "type": "api",
        "url": f"https://api.lever.co/v0/postings/{company_slug}?mode=json",
        "response_path": "",
        "fields": {
            "title": "text",
            "url": "hostedUrl",
            "location": "categories.location",
            "description": "descriptionPlain",
            "posted_date": "createdAt",
            "department": "categories.department",
        },
        "company_name": company_name,
    }


def _jazzhr_config(subdomain: str, company_name: str) -> dict:
    """Build a JazzHR server-rendered HTML config.

    JazzHR boards at {subdomain}.applytojob.com/apply/ serve SSR HTML with
    a consistent structure: ul.list-group > li.list-group-item.
    """
    return {
        "type": "html",
        "url": f"https://{subdomain}.applytojob.com/apply/",
        "requires_js": False,
        "job_selector": "li.list-group-item",
        "fields": {
            "title": "h3.list-group-item-heading a",
            "url": "h3.list-group-item-heading a@href",
            "location": "ul.list-inline li",
        },
        "company_name": company_name,
    }


def _trakstar_config(subdomain: str, company_name: str) -> dict:
    """Build a Trakstar Hire server-rendered HTML config."""
    return {
        "type": "html",
        "url": f"https://{subdomain}.hire.trakstar.com/",
        "requires_js": False,
        "job_selector": ".js-careers-page-job-list-item",
        "fields": {
            "title": "h3.js-job-list-opening-name",
            "url": "a@href",
            "location": ".js-job-list-opening-loc",
        },
        "company_name": company_name,
        "base_url": f"https://{subdomain}.hire.trakstar.com",
    }


def _js_render_config(
    url: str,
    job_selector: str,
    wait_for: str,
    fields: dict,
    company_name: str,
    base_url: str = "",
    timeout: int = 30000,
) -> dict:
    """Build a generic JS-render HTML config for SPAs."""
    config = {
        "type": "html",
        "url": url,
        "requires_js": True,
        "render_wait_for": wait_for,
        "render_timeout_ms": timeout,
        "job_selector": job_selector,
        "fields": fields,
        "company_name": company_name,
    }
    if base_url:
        config["base_url"] = base_url
    return config


def _ashby_config(board_name: str, company_name: str) -> dict:
    """Build an Ashby API config."""
    return {
        "type": "api",
        "url": f"https://api.ashbyhq.com/posting-api/job-board/{board_name}?includeCompensation=true",
        "response_path": "jobs",
        "fields": {
            "title": "title",
            "url": "jobUrl",
            "location": "location",
            "description": "descriptionHtml",
            "posted_date": "publishedAt",
            "department": "department",
        },
        "salary_min_field": "compensation.summaryComponents[compensationType=Salary].minValue",
        "salary_max_field": "compensation.summaryComponents[compensationType=Salary].maxValue",
        "company_name": company_name,
    }


def _workable_config(company_slug: str, company_name: str) -> dict:
    """Build a Workable API config."""
    return {
        "type": "api",
        "url": f"https://apply.workable.com/api/v1/widget/accounts/{company_slug}",
        "response_path": "jobs",
        "fields": {
            "title": "title",
            "url": "url",
            "location": "location",
            "department": "department",
        },
        "company_name": company_name,
    }


def _recruiterbox_config(company_id: str, company_name: str) -> dict:
    """Build a RecruiterBox (Trakstar Hire) widget API config.

    RecruiterBox widget API returns a flat array of job objects with:
    id, hash_id, title, allows_remote, position_type, location, company_name, team, description.
    """
    return {
        "type": "api",
        "url": f"https://app.recruiterbox.com/widget/{company_id}/openings/",
        "response_path": "",
        "fields": {
            "title": "title",
            "url": "hash_id",
            "location": "location.city",
            "description": "description",
            "department": "team",
        },
        "base_url": f"https://app.recruiterbox.com/widget/{company_id}/openings/",
        "company_name": company_name,
    }


# ── Source fix registry ──────────────────────────────────────────────────
#
# Each entry can specify:
#   config:      new config dict, or None to keep existing (just clear disable fields)
#   source_type: new source_type column value, or None to keep existing
#   name:        new source name, or None to keep existing
#   company_fix: dict with {name, website} to update the linked company record

SOURCES_TO_FIX = {
    # ── Tier 1: Verified API configs ─────────────────────────────────────
    # Wood PLC — Oracle HCM REST API (981 jobs verified)
    "db886a37-0b07-4448-8fe5-ee262834b6ff": {
        "name": "Wood PLC Jobs (oraclecloud.com)",
        "config": _oracle_hcm_config(
            "ehif.fa.em2.oraclecloud.com",
            "CX_1001",
            "Wood PLC",
        ),
        "source_type": "api",
    },
    # ACME — Oracle HCM REST API (5,953 jobs verified)
    "f1fbfb33-1f11-41c2-9ffe-c7318aa095b1": {
        "name": None,
        "config": _oracle_hcm_config(
            "eofd.fa.us6.oraclecloud.com",
            "CX_1001",
            "ACME",
        ),
        "source_type": "api",
    },
    # Altera Digital Health — moved from defunct Greenhouse to Workday (42 jobs verified)
    "bbdbd3a0-c3f7-4cfc-8da0-c4a314e3c39f": {
        "name": "Altera Digital Health Jobs (myworkdayjobs.com)",
        "config": _workday_config(
            "harriscomputer",
            "wd3",
            "Altera",
            "Altera Digital Health",
        ),
        "source_type": "api",
    },
    # ── Tier 2: Lever API discovery ──────────────────────────────────────
    # 1840 & Company — jobs.1840andco.com redirects to Lever
    "3ad359a2-19d5-476a-ad32-d8f1dc7ad276": {
        "name": "1840 & Company Jobs (lever.co)",
        "config": _lever_config("1840%26Company", "1840 & Company"),
        "source_type": "api",
    },
    # Rackspace — Vue.js SPA wrapping Lever API underneath
    "8965b136-660e-44f5-a850-385a97dad9d7": {
        "name": "Rackspace Jobs (lever.co)",
        "config": _lever_config("rackspace", "Rackspace"),
        "source_type": "api",
    },
    # ── Tier 3: Server-rendered HTML (no JS needed) ──────────────────────
    # Bitovi — JazzHR, SSR verified, 3 jobs
    "d57f9be4-832a-4f2b-b5a2-51197bc3d533": {
        "name": None,
        "config": _jazzhr_config("bitovi", "Bitovi"),
        "source_type": "html",
    },
    # iNTERFACEWARE — JazzHR, same SSR pattern
    "3e311af8-1e92-4368-8aa5-97e70c90d163": {
        "name": None,
        "config": _jazzhr_config("interfaceware", "iNTERFACEWARE"),
        "source_type": "html",
    },
    # Therap (BD) — Trakstar Hire, SSR verified, 12 jobs
    "fa63887e-c041-464e-940e-b0d06859275c": {
        "name": None,
        "config": _trakstar_config("therap", "Therap (BD) Ltd."),
        "source_type": "html",
    },
    # hireaniner.charlotte.edu — custom university job board, SSR verified
    "8a70530f-40e9-43d7-82e1-d62f8e5ca062": {
        "name": None,
        "config": {
            "type": "html",
            "url": "https://hireaniner.charlotte.edu/jobs/",
            "requires_js": False,
            "job_selector": "div.job",
            "fields": {
                "title": "h3 a",
                "url": "h3 a@href",
            },
            "base_url": "https://hireaniner.charlotte.edu/jobs/",
            "company_name": "UNC Charlotte (HireANiner)",
        },
        "source_type": "html",
    },
    # Google — SSR verified at new URL (careers.google.com 301→ this URL), 50 jobs
    # Note: class names are minified (QJPWVe, WpHeLc) and may change across deploys
    "8a6c0caa-c3df-47f1-9a60-07e95e59e6a7": {
        "name": "Google Jobs",
        "config": {
            "type": "html",
            "url": "https://www.google.com/about/careers/applications/jobs/results",
            "requires_js": False,
            "job_selector": "div.sMn82b",
            "fields": {
                "title": "h3.QJPWVe",
                "url": "a.WpHeLc@href",
                "location": "span.r0wTof",
            },
            "base_url": "https://www.google.com/about/careers/applications/",
            "company_name": "Google",
            "pagination_type": "page_num",
            "pagination_param": "page",
            "page_start": 1,
            "max_pages": 20,
        },
        "source_type": "html",
        "company_fix": {"name": "Google"},
    },
    # STERIS — SuccessFactors career site, SSR verified (not JS-rendered)
    "4cef5b4e-6d78-4c43-afc7-ca7f1a2193dc": {
        "name": "STERIS Jobs",
        "config": {
            "type": "html",
            "url": (
                "https://careers.steris.com/search/"
                "?q=&sortColumn=referencedate&sortDirection=desc&startrow={offset}"
            ),
            "requires_js": False,
            "job_selector": "a.jobTitle-link",
            "fields": {
                "title": "::text",
                "url": "@href",
            },
            "base_url": "https://careers.steris.com",
            "company_name": "STERIS",
            "pagination_type": "url_template",
            "page_size": 25,
            "max_pages": 20,
        },
        "source_type": "html",
    },
    # Glama — Remix SSR verified, unstable CSS-in-JS class names, use DOM structure
    "de8c9ee8-94a0-4937-a3e6-bccfcf5a0164": {
        "name": None,
        "config": {
            "type": "html",
            "url": "https://glama.ai/careers",
            "requires_js": False,
            "job_selector": "ul li:has(a[data-sentry-component='Link'])",
            "fields": {
                "title": "a span",
                "url": "a@href",
            },
            "base_url": "https://glama.ai",
            "company_name": "Glama",
        },
        "source_type": "html",
    },
    # Beacon Hill — WordPress + WP Job Manager, SSR verified, 20 jobs per page
    "fc6c559e-5cd0-420d-9bfd-777a4abc8045": {
        "name": None,
        "config": {
            "type": "html",
            "url": "https://bhsg.com/jobs/job-search/",
            "requires_js": False,
            "job_selector": "div.job-card",
            "fields": {
                "title": "h3.job-card__title a",
                "url": "h3.job-card__title a@href",
                "location": "div.job-card__meta--top span.job-card__metaItem",
            },
            "company_name": "Beacon Hill Staffing Group",
            "headers": {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
            },
        },
        "source_type": "html",
    },
    # ── Tier 4: JS render pipeline ───────────────────────────────────────
    # Meta — React SPA + GraphQL, needs headless browser
    "13ef4cb2-9673-4792-91c6-fb0e878b3aeb": {
        "name": "Meta Jobs",
        "config": _js_render_config(
            url="https://www.metacareers.com/jobs",
            job_selector="div[data-testid='search-result'], a[href*='/jobs/']",
            wait_for="a[href*='/jobs/']",
            fields={
                "title": "div[role='heading'], span",
                "url": "a[href*='/jobs/']@href",
                "location": "span:last-child",
            },
            company_name="Meta",
            base_url="https://www.metacareers.com",
        ),
        "source_type": "html",
        "company_fix": {"name": "Meta"},
    },
    # Microsoft — Eightfold-powered career site
    "fa5b4845-2883-4fc0-a0b1-bcae67abe1a7": {
        "name": "Microsoft Jobs",
        "config": _js_render_config(
            url="https://careers.microsoft.com/v2/global/en/search",
            job_selector=".ms-List-cell, div[data-automationid='ListCell']",
            wait_for=".ms-List-cell, div[data-automationid='ListCell']",
            fields={
                "title": "a[aria-label], h2",
                "url": "a@href",
                "location": "span[class*='location'], .jobLocation",
            },
            company_name="Microsoft",
            base_url="https://careers.microsoft.com",
        ),
        "source_type": "html",
        "company_fix": {"name": "Microsoft"},
    },
    # Thermo Fisher — Phenom People platform, JS widgets
    "3128f320-0cb4-4d85-80ee-d479019e74c2": {
        "name": "Thermo Fisher Scientific Jobs",
        "config": _js_render_config(
            url="https://jobs.thermofisher.com/global/en/search-results",
            job_selector="ph-search-results-job-card, .job-card",
            wait_for="ph-search-results-job-card, .job-card",
            fields={
                "title": ".job-title, a[data-ph-at-job-title-text]",
                "url": "a[data-ph-at-job-title-text]@href, a.job-title@href",
                "location": ".job-location, span[data-ph-at-job-location-text]",
            },
            company_name="Thermo Fisher Scientific",
            base_url="https://jobs.thermofisher.com",
            timeout=45000,
        ),
        "source_type": "html",
        "company_fix": {"name": "Thermo Fisher Scientific"},
    },
    # UnitedHealth Group — custom career portal
    "520d2ca6-7496-4603-9bab-61694d4f70d1": {
        "name": None,
        "config": _js_render_config(
            url="https://careers.unitedhealthgroup.com/search-jobs/",
            job_selector=".job-list-item, tr[data-job-id], .job-row",
            wait_for=".job-list-item, tr[data-job-id], .job-row, .job-title",
            fields={
                "title": "a, .job-title",
                "url": "a@href",
                "location": ".job-location, .location",
            },
            company_name="UnitedHealth Group",
            base_url="https://careers.unitedhealthgroup.com",
        ),
        "source_type": "html",
    },
    # ClearBridge — Bullhorn Angular SPA
    "a2e57fe9-d8af-42d7-90ff-d03678eb214c": {
        "name": None,
        "config": _js_render_config(
            url="https://clearbridgetech.com/careers/",
            job_selector=".job-listing, .job-item, app-job-list-item",
            wait_for=".job-listing, .job-item, app-job-list-item",
            fields={
                "title": "h2, h3, .job-title",
                "url": "a@href",
                "location": ".job-location, .location",
            },
            company_name="ClearBridge Technology Group",
            base_url="https://clearbridgetech.com",
        ),
        "source_type": "html",
    },
    # silverorange — Next.js + JazzHR embed, also needs type fix (json→html)
    "fb168c07-1ef1-4df3-b262-ca13ecbf8476": {
        "name": None,
        "config": _js_render_config(
            url="https://www.silverorange.com/job",
            job_selector=".job-posting, .posting, li.list-group-item",
            wait_for=".job-posting, .posting, iframe[src*='applytojobs'], li.list-group-item",
            fields={
                "title": "h3, .job-title, h3.list-group-item-heading a",
                "url": "a@href",
                "location": ".location, .job-location",
            },
            company_name="silverorange",
        ),
        "source_type": "html",
    },
    # Rapinno Tech — Angular SPA
    "0a1a0c4e-5452-4715-a4df-ea37a52f735a": {
        "name": None,
        "config": _js_render_config(
            url="https://rapinnotech.com/career",
            job_selector="a[href^='/career/']",
            wait_for="a[href^='/career/']",
            fields={
                "title": "::text",
                "url": "@href",
            },
            company_name="Rapinno Tech",
            base_url="https://rapinnotech.com",
            timeout=45000,
        ),
        "source_type": "html",
    },
    # BAM Technologies — Webflow CMS dynamic list
    "41b985c7-e620-4af5-a863-44d47e04b98d": {
        "name": None,
        "config": _js_render_config(
            url="https://www.bamtech.net/open-positions",
            job_selector=".w-dyn-item",
            wait_for=".w-dyn-item",
            fields={
                "title": "h3, h2, .job-title",
                "url": "a@href",
                "location": ".job-location, .location",
            },
            company_name="BAM Technologies",
            base_url="https://www.bamtech.net",
        ),
        "source_type": "html",
    },
    # RxCloud — WordPress careers page
    "ae4b2efb-720e-4d3b-a7a9-81253f460423": {
        "name": None,
        "config": _js_render_config(
            url="https://www.therxcloud.com/career/",
            job_selector=".job-listing, .career-listing, article",
            wait_for=".job-listing, .career-listing, article, .entry-content",
            fields={
                "title": "h2, h3, .job-title",
                "url": "a@href",
                "location": ".job-location, .location",
            },
            company_name="RxCloud",
        ),
        "source_type": "html",
    },
    # Med-Metrix — Dayforce HCM (Next.js CSR), discovered at jobs.dayforcehcm.com
    "97893a32-19df-4af3-ad9b-86ffac4cf147": {
        "name": None,
        "config": _js_render_config(
            url="https://jobs.dayforcehcm.com/en-US/medmetrix/CANDIDATEPORTAL",
            job_selector=".job-card, a[href*='/job/']",
            wait_for=".job-card, a[href*='/job/'], .ant-card",
            fields={
                "title": "h3, .job-title, span",
                "url": "a@href",
                "location": ".job-location, .location",
            },
            company_name="Med-Metrix",
            base_url="https://jobs.dayforcehcm.com",
            timeout=45000,
        ),
        "source_type": "html",
    },
    # Digital Resource — ADP WorkforceNow iframe (discovered, replaces Webflow page)
    "f306a62a-b9e9-4ef4-95c8-08ecd290a3f2": {
        "name": None,
        "config": _js_render_config(
            url=(
                "https://workforcenow.adp.com/mascsr/default/mdf/recruitment/"
                "recruitment.html?cid=11803d10-313d-49cd-a2bb-26522c9bc2d6"
                "&ccId=19000101_000001&type=MP&lang=en_US"
            ),
            job_selector=".current-openings-item, .job-listing, tr.job-row",
            wait_for=".current-openings-item, .job-listing, tr.job-row",
            fields={
                "title": ".job-title, a, h3",
                "url": "a@href",
                "location": ".job-location, .location",
            },
            company_name="Digital Resource",
            timeout=45000,
        ),
        "source_type": "html",
    },
    # ── Tier 5: URL/config fixes ─────────────────────────────────────────
    # BuiltIn Aggregator — transient timeout, re-enable with cleared disable notes
    "20853555-ca87-4f7f-951e-5bc832bdec67": {
        "name": None,
        "config": None,
        "source_type": None,
    },
    # Strattmont — URL fix (was 404), new URL is WordPress accordion (no per-job URLs)
    "4793d9d2-03aa-494e-a198-54f29a79c6a7": {
        "name": None,
        "config": {
            "type": "html",
            "url": "https://www.strattmontgroup.com/careers-join-our-team/",
            "requires_js": False,
            "job_selector": "div.accordion div.card.card-default",
            "fields": {
                "title": "h4.card-title a.accordion-toggle",
                "url": "h4.card-title a.accordion-toggle@href",
            },
            "base_url": "https://www.strattmontgroup.com/careers-join-our-team/",
            "company_name": "Strattmont Group",
        },
        "source_type": "html",
        "company_fix": {"name": "Strattmont Group"},
    },
    # ── Tier 6: Ashby API discovery ───────────────────────────────────────
    # Voodoo — Ashby API (103 jobs verified)
    "fafbbdfc-e16c-4a7b-84c3-b3f112fd0f45": {
        "name": "Voodoo Jobs (ashbyhq.com)",
        "config": _ashby_config("voodoo", "Voodoo"),
        "source_type": "api",
    },
    # Toggl — Ashby API (0 jobs currently but account active)
    "ef209939-c0ab-465a-9d18-f99ca151443c": {
        "name": "Toggl Jobs (ashbyhq.com)",
        "config": _ashby_config("toggl", "Toggl"),
        "source_type": "api",
    },
    # ── Tier 7: Workable API discovery ────────────────────────────────────
    # Paymentology — Workable API (0 jobs currently but account active)
    "27b10f1d-3c27-4694-8430-c3bc899f97ed": {
        "name": "Paymentology Jobs (workable.com)",
        "config": _workable_config("paymentology", "Paymentology"),
        "source_type": "api",
    },
    # Recruit 121 — Workable API (0 jobs currently but account active)
    "c164da2e-00f2-4705-ae8b-b9190ae0bd8c": {
        "name": "Recruit 121 Group Jobs (workable.com)",
        "config": _workable_config("recruit-121", "Recruit 121 Group"),
        "source_type": "api",
    },
    # ── Tier 8: RecruiterBox API discovery ────────────────────────────────
    # Sedron Technologies — RecruiterBox widget API (8 jobs verified)
    "646c8643-20a6-42fe-8ccb-20add1cdc2e0": {
        "name": "Sedron Technologies Jobs (recruiterbox.com)",
        "config": _recruiterbox_config("22642", "Sedron Technologies"),
        "source_type": "api",
    },
    # ── Tier 9: More Lever API discovery ──────────────────────────────────
    # Qvest — Lever API (28 jobs verified, Personio endpoint was dead)
    "78fefb9a-7da5-436d-b6a5-5c7969dd73e0": {
        "name": "Qvest Jobs (lever.co)",
        "config": _lever_config("qvest.us", "Qvest"),
        "source_type": "api",
    },
    # Lumin Digital — Lever API (15 jobs verified)
    "0e4c0a9c-e916-44f3-9ea7-4879572e6ecb": {
        "name": "Lumin Digital Jobs (lever.co)",
        "config": _lever_config("LuminDigital", "Lumin Digital"),
        "source_type": "api",
    },
    # Paradigm Health — Lever API (12 jobs verified)
    "ec42611e-1953-4ade-a070-941fe04f3bf4": {
        "name": "Paradigm Health Jobs (lever.co)",
        "config": _lever_config("paradigm-health", "Paradigm Health"),
        "source_type": "api",
    },
    # ── Tier 10: Webflow CMS fix ─────────────────────────────────────────
    # The Silicon Forest — Oregon tech job board, Webflow CMS dynamic list
    "569f1597-15ea-47dc-94ee-36528b99b5dc": {
        "name": None,
        "config": _js_render_config(
            url="https://www.thesiliconforest.com/oregon-tech-jobs",
            job_selector=".w-dyn-item",
            wait_for=".w-dyn-item, .w-dyn-list",
            fields={
                "title": "h3, .w-commerce-commercecartproductname, a",
                "url": "a@href",
                "location": ".location, span",
            },
            company_name="The Silicon Forest",
            base_url="https://www.thesiliconforest.com",
        ),
        "source_type": "html",
    },
}


# ── Sources to soft-delete ───────────────────────────────────────────────
#
# These sources have no working endpoint, are duplicates, or defunct.
# We set status='deleted' (not hard-delete) to preserve history.

SOURCES_TO_DELETE = {
    # 102 Yahoo Inc. — duplicate of active Yahoo Jobs (myworkdayjobs.com)
    "71d0e2d3-34ae-45d4-9a5b-1408c033ebab": "Duplicate of active Yahoo myworkdayjobs source",
    # Engineering Comfort Solutions — defunct company, DNS failures
    "14ce5d74-dcd0-4a8c-ad8e-c8a073499d08": "Defunct company, no web presence",
    # Tech Innovations (RemoteOK) — shell company + anti-bot
    "9f80a3b0-c524-47db-8685-ebab24fc7bfc": "Shell company + RemoteOK anti-bot",
    # PradeepIT — domain dead (500 error)
    "6a4eda7b-eb5b-42d6-9fef-f2e3d3e86c00": "Domain dead (HTTP 500)",
    # Cortes 23 — no careers page, no ATS found
    "38af0e80-dbbc-40cc-b4c2-2a5368b39c35": "No careers page or ATS found",
    # Jaguar Design Studio — no careers page, no ATS found
    "756c4173-3ab7-4ebe-b158-43929a8fa2d7": "No careers page or ATS found",
    # Second Door Health — no formal hiring, about page only
    "ebae1ecb-38b0-4544-babd-f75749db2f15": "No formal hiring page",
    # FRMG Inc (First Resources Management Group) — LinkedIn only, not scrapable
    "a3e9b300-37e5-4a33-b5f9-4c565f0482d7": "LinkedIn only, not scrapable",
    # AEXGroup — no ATS or structured careers page found
    "245d897d-4c53-4108-a6f3-0672c615260a": "No ATS or structured careers page found",
    # Apexver — static Squarespace page, no structured job listings
    "44cd54d9-b15f-4b2e-a3b7-a3caa94a20bf": "Static Squarespace page, no structured listings",
    # Mitre Media — LinkedIn only, SmartRecruiters returned 0 jobs
    "c428ec22-0297-446d-ab94-dbfcc1745e9a": "LinkedIn only, SmartRecruiters returned 0 jobs",
    # TheHiveCareers — custom CSRF-protected platform, 0 job listings
    "40d48be5-ed07-48de-8384-01c406491cbb": "Custom CSRF platform, 0 job listings",
    # Indeed RSS — 403 anti-bot, no workaround available
    "6b1e0752-c895-419e-bbe9-f5cf9955720d": "403 anti-bot, no workaround available",
    # Monster RSS — endpoint removed, Monster shut down RSS feeds
    "93c59e2f-cc9d-4a33-94dc-cd5d0d6f8790": "RSS endpoint removed, Monster shut down feeds",
}


def run_migration(db_path: str, dry_run: bool = False) -> None:
    """Fix, re-enable, or soft-delete disabled/failed sources."""
    logger.info("=" * 60)
    logger.info("Fix remaining disabled sources — migration #2")
    logger.info("=" * 60)
    logger.info(f"Database: {db_path}")
    logger.info(f"Dry run: {dry_run}")
    logger.info(f"Sources to fix: {len(SOURCES_TO_FIX)}")
    logger.info(f"Sources to delete: {len(SOURCES_TO_DELETE)}")
    logger.info("")

    conn = None
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        fixed = 0
        skipped = 0
        deleted = 0
        companies_fixed = 0

        # ── Fix and re-enable sources ────────────────────────────────────
        logger.info("── Fixing sources ──")
        for source_id, fix in SOURCES_TO_FIX.items():
            new_name = fix.get("name")
            new_config = fix.get("config")
            new_source_type = fix.get("source_type")
            company_fix = fix.get("company_fix")

            cursor.execute(
                "SELECT id, name, status, source_type, config_json, company_id "
                "FROM job_sources WHERE id = ?",
                (source_id,),
            )
            row = cursor.fetchone()

            if not row:
                logger.warning(f"  NOT FOUND: {source_id}")
                skipped += 1
                continue

            name = row["name"]
            status = row["status"]

            if status not in ("disabled", "failed"):
                logger.info(f"  SKIP (status={status}): {name}")
                skipped += 1
                continue

            now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            display_name = new_name or name
            changes = []

            if new_config is not None:
                config_json = json.dumps(new_config)
                source_type = new_source_type or row["source_type"]
                changes.append(f"config → {new_config['type']}:{new_config['url'][:80]}")
            else:
                # Keep existing config, clear disable-related fields
                try:
                    config = json.loads(row["config_json"]) if row["config_json"] else {}
                except json.JSONDecodeError:
                    logger.warning(f"  SKIP (bad JSON): {name}")
                    skipped += 1
                    continue

                removed = []
                for key in ("disabled_notes", "disabled_tags", "consecutive_failures"):
                    if key in config:
                        removed.append(key)
                        config.pop(key)

                config_json = json.dumps(config)
                source_type = new_source_type or row["source_type"]
                if removed:
                    changes.append(f"cleared {', '.join(removed)}")

            if new_name and new_name != name:
                changes.append(f"name: {name} → {new_name}")

            if new_source_type and new_source_type != row["source_type"]:
                changes.append(f"source_type: {row['source_type']} → {new_source_type}")

            logger.info(f"  FIX: {display_name} ({status} → active)")
            for change in changes:
                logger.info(f"    {change}")

            if not dry_run:
                cursor.execute(
                    """
                    UPDATE job_sources
                    SET status = 'active',
                        name = COALESCE(?, name),
                        config_json = ?,
                        source_type = ?,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (new_name, config_json, source_type, now, source_id),
                )

            # Fix linked company record if needed
            if company_fix and row["company_id"]:
                company_id = row["company_id"]
                fix_name = company_fix.get("name")
                fix_website = company_fix.get("website")

                parts = []
                if fix_name:
                    parts.append(f"name → {fix_name}")
                if fix_website:
                    parts.append(f"website → {fix_website}")
                logger.info(f"    company ({company_id}): {', '.join(parts)}")

                if not dry_run:
                    if fix_name and fix_website:
                        cursor.execute(
                            "UPDATE companies SET name = ?, website = ?, updated_at = ? "
                            "WHERE id = ?",
                            (fix_name, fix_website, now, company_id),
                        )
                    elif fix_name:
                        cursor.execute(
                            "UPDATE companies SET name = ?, updated_at = ? WHERE id = ?",
                            (fix_name, now, company_id),
                        )
                companies_fixed += 1

            fixed += 1

        # ── Soft-delete defunct sources ───────────────────────────────────
        logger.info("")
        logger.info("── Deleting defunct sources ──")
        for source_id, reason in SOURCES_TO_DELETE.items():
            cursor.execute(
                "SELECT id, name, status FROM job_sources WHERE id = ?",
                (source_id,),
            )
            row = cursor.fetchone()

            if not row:
                logger.warning(f"  NOT FOUND: {source_id}")
                continue

            name = row["name"]
            status = row["status"]

            if status == "deleted":
                logger.info(f"  SKIP (already deleted): {name}")
                continue

            logger.info(f"  DELETE: {name} — {reason}")

            if not dry_run:
                now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                cursor.execute(
                    "UPDATE job_sources SET status = 'deleted', updated_at = ? WHERE id = ?",
                    (now, source_id),
                )

            deleted += 1

        if not dry_run:
            conn.commit()
    finally:
        if conn:
            conn.close()

    logger.info("")
    logger.info("=" * 60)
    logger.info("Migration Complete")
    logger.info("=" * 60)
    logger.info(f"  Sources fixed & re-enabled: {fixed}")
    logger.info(f"  Sources soft-deleted:       {deleted}")
    logger.info(f"  Company records corrected:  {companies_fixed}")
    logger.info(f"  Skipped (not disabled/failed or not found): {skipped}")
    if dry_run:
        logger.info("  (dry run — no changes written)")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(
            "Usage: python -m job_finder.migrations.fix_remaining_disabled_sources"
            " <db_path> [--dry-run]"
        )
        sys.exit(1)

    db_path = sys.argv[1]
    dry_run = "--dry-run" in sys.argv

    run_migration(db_path, dry_run)
