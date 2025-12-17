#!/usr/bin/env python3
"""Standalone tool for investigating failed job sources with Playwright.

This tool helps debug source discovery/recovery failures by:
1. Rendering the page with Playwright (including JS)
2. Detecting ATS providers (Greenhouse, Lever, Ashby, etc.)
3. Finding potential job listing elements
4. Checking for bot protection
5. Intercepting API calls made by the page
6. Probing known ATS APIs for the company

Usage:
    python scripts/investigate_source.py https://example.com/careers
    python scripts/investigate_source.py https://example.com/careers --company "Acme Corp"
    python scripts/investigate_source.py https://example.com/careers --save-html output.html
    python scripts/investigate_source.py https://example.com/careers --probe-ats
    python scripts/investigate_source.py https://example.com/careers --all
"""

import argparse
import json
import re
import sys
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

# Add src to path for imports
sys.path.insert(0, "src")


@dataclass
class InvestigationResult:
    """Result of investigating a source URL."""

    url: str
    final_url: str
    status: str  # ok, timeout, error, bot_protection
    duration_ms: int

    # Page analysis
    title: str = ""
    detected_ats: Optional[str] = None
    bot_protection: Optional[str] = None
    job_element_candidates: List[Dict[str, Any]] = field(default_factory=list)

    # Network analysis
    api_calls: List[Dict[str, str]] = field(default_factory=list)
    iframes: List[str] = field(default_factory=list)

    # Content
    html_length: int = 0
    html_sample: str = ""
    full_html: str = ""  # Full HTML for saving (not included in JSON output)

    # ATS probe results
    ats_probe_results: List[Dict[str, Any]] = field(default_factory=list)

    # Errors
    errors: List[str] = field(default_factory=list)


# ATS detection patterns
ATS_PATTERNS = {
    "greenhouse": [
        r"greenhouse\.io",
        r"boards\.greenhouse\.io",
        r"boards-api\.greenhouse\.io",
        r"api\.greenhouse\.io",
        r"greenhouse-embed",
        r"gh_jid",
    ],
    "lever": [
        r"lever\.co",
        r"jobs\.lever\.co",
        r"api\.lever\.co",
        r"lever-jobs-embed",
    ],
    "ashby": [
        r"ashbyhq\.com",
        r"jobs\.ashbyhq\.com",
        r"api\.ashbyhq\.com",
    ],
    "workday": [
        r"myworkdayjobs\.com",
        r"workday\.com",
        r"wd\d+\.myworkdayjobs",
    ],
    "smartrecruiters": [
        r"smartrecruiters\.com",
        r"jobs\.smartrecruiters\.com",
    ],
    "icims": [
        r"icims\.com",
        r"careers-.*\.icims\.com",
    ],
    "taleo": [
        r"taleo\.net",
        r"oracle\.com/taleo",
    ],
    "jobvite": [
        r"jobvite\.com",
        r"jobs\.jobvite\.com",
    ],
    "recruitee": [
        r"recruitee\.com",
    ],
    "applytojob": [
        r"applytojob\.com",
    ],
}

# Bot protection patterns
BOT_PROTECTION_PATTERNS = {
    "cloudflare": [
        r"cf-browser-verification",
        r"cf_clearance",
        r"cloudflare",
        r"ray id",
        r"checking your browser",
        r"cf-ray",
        r"__cf_bm",
    ],
    "recaptcha": [
        r"recaptcha",
        r"g-recaptcha",
        r"grecaptcha",
    ],
    "hcaptcha": [
        r"hcaptcha",
        r"h-captcha",
    ],
    "datadome": [
        r"datadome",
    ],
    "perimeter_x": [
        r"perimeterx",
        r"px-captcha",
    ],
    "auth_required": [
        r"sign.?in.*to.*continue",
        r"log.?in.*required",
        r"please.*log.?in",
        r"authentication.*required",
    ],
}

# Common job listing selectors
JOB_SELECTORS = [
    # Generic
    '[class*="job"]',
    '[class*="position"]',
    '[class*="opening"]',
    '[class*="career"]',
    '[class*="vacancy"]',
    '[id*="job"]',
    "[data-job]",
    "[data-position]",
    # Specific ATS
    ".opening",  # Lever
    ".job-post",
    ".job-listing",
    ".job-card",
    ".posting",
    "article.job",
    "li.job",
    "tr.job",
]


def detect_ats(html: str, url: str) -> Optional[str]:
    """Detect which ATS provider is used based on HTML content and URL."""
    combined = (html + " " + url).lower()

    for ats_name, patterns in ATS_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, combined, re.IGNORECASE):
                return ats_name

    return None


def detect_bot_protection(html: str) -> Optional[str]:
    """Detect bot protection in page content."""
    html_lower = html.lower()

    for protection_name, patterns in BOT_PROTECTION_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, html_lower, re.IGNORECASE):
                return protection_name

    return None


def investigate_with_playwright(
    url: str,
    timeout_ms: int = 30000,
    wait_for_selector: Optional[str] = None,
) -> InvestigationResult:
    """Render page with Playwright and analyze content."""
    try:
        from playwright.sync_api import sync_playwright
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
    except ImportError:
        print("ERROR: playwright is not installed.")
        print("Install it with: pip install playwright && playwright install chromium")
        sys.exit(1)

    result = InvestigationResult(
        url=url,
        final_url=url,
        status="ok",
        duration_ms=0,
    )

    start = time.monotonic()
    api_calls: List[Dict[str, str]] = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=["--disable-dev-shm-usage", "--no-sandbox"],
            )
            context = browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                viewport={"width": 1280, "height": 2000},
            )
            page = context.new_page()

            # Intercept network requests to find API calls
            def handle_request(request):
                req_url = request.url.lower()
                # Track JSON API calls
                if any(
                    x in req_url for x in ["/api/", "/v1/", "/v2/", ".json", "graphql"]
                ) or request.resource_type in ("xhr", "fetch"):
                    api_calls.append(
                        {
                            "url": request.url,
                            "method": request.method,
                            "type": request.resource_type,
                        }
                    )

            page.on("request", handle_request)

            # Navigate to page
            try:
                page.goto(url, wait_until="networkidle", timeout=timeout_ms)
            except PlaywrightTimeoutError as e:
                result.status = "timeout"
                result.errors.append(f"Navigation timeout: {e}")
            except Exception as e:
                result.status = "error"
                result.errors.append(f"Navigation error: {e}")

            # Wait for additional selector if specified
            if wait_for_selector and result.status == "ok":
                try:
                    page.wait_for_selector(wait_for_selector, timeout=5000)
                except PlaywrightTimeoutError:
                    # Selector not found within timeout - continue with available content
                    pass
                except Exception as e:
                    # Log unexpected errors but don't fail the investigation
                    result.errors.append(f"Selector wait error: {e}")

            # Get page content
            html = page.content()
            result.html_length = len(html)
            result.html_sample = html[:5000]
            result.full_html = html
            result.final_url = page.url
            result.title = page.title()

            # Detect ATS
            result.detected_ats = detect_ats(html, page.url)

            # Detect bot protection
            result.bot_protection = detect_bot_protection(html)
            if result.bot_protection:
                result.status = "bot_protection"

            # Find iframes (often used to embed ATS)
            iframes = page.query_selector_all("iframe")
            for iframe in iframes:
                src = iframe.get_attribute("src")
                if src:
                    result.iframes.append(src)
                    # Check iframe source for ATS
                    iframe_ats = detect_ats(src, "")
                    if iframe_ats and not result.detected_ats:
                        result.detected_ats = iframe_ats

            # Find job listing candidates
            for selector in JOB_SELECTORS:
                try:
                    elements = page.query_selector_all(selector)
                    if elements and len(elements) > 0 and len(elements) < 200:
                        # Get sample of elements
                        sample_count = min(3, len(elements))
                        samples = []
                        for i in range(sample_count):
                            text = elements[i].inner_text()[:200]
                            samples.append(text)

                        result.job_element_candidates.append(
                            {
                                "selector": selector,
                                "count": len(elements),
                                "samples": samples,
                            }
                        )
                except Exception:
                    # Some selectors may fail on certain pages - silently continue
                    pass

            result.api_calls = api_calls

            browser.close()

    except Exception as e:
        result.status = "error"
        result.errors.append(str(e))

    result.duration_ms = int((time.monotonic() - start) * 1000)
    return result


def probe_ats_apis(
    company_name: Optional[str] = None,
    url: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Probe known ATS APIs to find which one the company uses."""
    from job_finder.scrapers.ats_prober import (
        ATS_PROVIDERS,
        generate_slug_variations,
        probe_ats_provider,
        probe_workday,
    )

    results = []

    # Generate slugs using the same logic as the main prober
    slugs: List[str] = []
    if company_name:
        slugs.extend(generate_slug_variations(company_name))

    if url:
        # Also try domain-based slug
        parsed = urlparse(url)
        domain = parsed.netloc.lower().replace("www.", "")
        domain_slug = domain.split(".")[0]
        if domain_slug and domain_slug not in slugs:
            slugs.append(domain_slug)

    if not slugs:
        return results

    print(f"\nProbing ATS APIs with slugs: {slugs}")
    print("-" * 50)

    for provider in ATS_PROVIDERS.keys():
        for slug in slugs:
            result = probe_ats_provider(provider, slug, timeout=5)
            if result.found:
                results.append(
                    {
                        "provider": provider,
                        "slug": slug,
                        "url": result.api_url,
                        "job_count": result.job_count,
                        "config": result.config,
                    }
                )
                print(f"  FOUND: {provider}/{slug} - {result.job_count} jobs")
                print(f"         URL: {result.api_url}")

    # Also probe Workday (requires special handling with POST requests)
    for slug in slugs:
        result = probe_workday(slug, timeout=5)
        if result.found:
            results.append(
                {
                    "provider": "workday",
                    "slug": slug,
                    "url": result.api_url,
                    "job_count": result.job_count,
                    "config": result.config,
                }
            )
            print(f"  FOUND: workday/{slug} - {result.job_count} jobs")
            print(f"         URL: {result.api_url}")

    if not results:
        print("  No ATS APIs found for these slugs")

    return results


def print_result(result: InvestigationResult, verbose: bool = False):
    """Print investigation results in a readable format."""
    print("\n" + "=" * 60)
    print("SOURCE INVESTIGATION RESULTS")
    print("=" * 60)

    print(f"\nURL: {result.url}")
    if result.final_url != result.url:
        print(f"Final URL: {result.final_url}")

    print(f"Status: {result.status}")
    print(f"Duration: {result.duration_ms}ms")
    print(f"Page Title: {result.title}")
    print(f"HTML Length: {result.html_length:,} chars")

    if result.detected_ats:
        print(f"\nDETECTED ATS: {result.detected_ats.upper()}")

    if result.bot_protection:
        print(f"\nBOT PROTECTION DETECTED: {result.bot_protection.upper()}")

    if result.iframes:
        print(f"\nIframes found ({len(result.iframes)}):")
        for iframe in result.iframes[:5]:
            print(f"  - {iframe[:100]}")

    if result.api_calls:
        print(f"\nAPI calls intercepted ({len(result.api_calls)}):")
        for call in result.api_calls[:10]:
            print(f"  [{call['method']}] {call['url'][:80]}")

    if result.job_element_candidates:
        print(f"\nJob element candidates:")
        for candidate in result.job_element_candidates[:5]:
            print(f"\n  Selector: {candidate['selector']}")
            print(f"  Count: {candidate['count']}")
            if verbose and candidate.get("samples"):
                print("  Samples:")
                for sample in candidate["samples"]:
                    print(f"    - {sample[:100]}...")

    if result.ats_probe_results:
        print(f"\nATS Probe Results:")
        for probe in result.ats_probe_results:
            print(f"  {probe['provider']}/{probe['slug']}: {probe['job_count']} jobs")
            print(f"    URL: {probe['url']}")

    if result.errors:
        print(f"\nErrors:")
        for error in result.errors:
            print(f"  - {error}")

    print("\n" + "=" * 60)


def main():
    parser = argparse.ArgumentParser(
        description="Investigate a job source URL with Playwright",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("url", help="URL to investigate")
    parser.add_argument("--company", "-c", help="Company name (for ATS probing)", default=None)
    parser.add_argument(
        "--timeout",
        "-t",
        type=int,
        default=30000,
        help="Page load timeout in ms (default: 30000)",
    )
    parser.add_argument(
        "--wait-for",
        "-w",
        help="CSS selector to wait for after page load",
        default=None,
    )
    parser.add_argument(
        "--save-html",
        "-s",
        help="Save rendered HTML to file",
        default=None,
    )
    parser.add_argument(
        "--probe-ats",
        "-p",
        action="store_true",
        help="Probe known ATS APIs for the company",
    )
    parser.add_argument(
        "--all",
        "-a",
        action="store_true",
        help="Run all investigations (equivalent to --probe-ats)",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Show verbose output including sample text",
    )
    parser.add_argument(
        "--json",
        "-j",
        action="store_true",
        help="Output results as JSON",
    )

    args = parser.parse_args()

    # Validate URL
    if not args.url.startswith(("http://", "https://")):
        args.url = "https://" + args.url

    print(f"Investigating: {args.url}")
    if args.company:
        print(f"Company: {args.company}")

    # Run Playwright investigation
    result = investigate_with_playwright(
        url=args.url,
        timeout_ms=args.timeout,
        wait_for_selector=args.wait_for,
    )

    # Run ATS probing if requested
    if args.probe_ats or args.all:
        result.ats_probe_results = probe_ats_apis(
            company_name=args.company,
            url=args.url,
        )

    # Save HTML if requested - reuse already-fetched content
    if args.save_html:
        if result.full_html:
            with open(args.save_html, "w", encoding="utf-8") as f:
                f.write(result.full_html)
            print(f"\nHTML saved to: {args.save_html}")
        else:
            print("\nWARNING: No HTML content available to save (page may have failed to load)")

    # Output results
    if args.json:
        # Convert to JSON-serializable dict using asdict, excluding full_html (too verbose)
        output = asdict(result)
        del output["full_html"]  # Don't include full HTML in JSON output
        del output["html_sample"]  # Also exclude sample to keep output clean
        print(json.dumps(output, indent=2))
    else:
        print_result(result, verbose=args.verbose)

    # Exit with appropriate code
    if result.status == "ok":
        sys.exit(0)
    elif result.status == "bot_protection":
        sys.exit(2)
    else:
        sys.exit(1)


if __name__ == "__main__":
    main()
