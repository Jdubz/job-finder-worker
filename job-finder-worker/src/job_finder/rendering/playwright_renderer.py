"""Lightweight Playwright renderer for JS-dependent sources.

MVP goals:
- Headless Chromium render with tight timeouts.
- Block heavy resources by default.
- Structured logging of duration, request count, and errors.
- Simple concurrency guard to avoid overloading the worker host.
"""

from __future__ import annotations

import hashlib
import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover - typing only
    from playwright.sync_api import (
        Browser,
        Page,
        TimeoutError as PlaywrightTimeoutError,
        sync_playwright,
    )


logger = logging.getLogger(__name__)


BLOCKED_RESOURCE_TYPES = {"image", "font", "media", "stylesheet"}


@dataclass
class RenderRequest:
    url: str
    wait_for_selector: Optional[str] = None
    wait_timeout_ms: int = 20_000
    block_resources: bool = True
    headers: Dict[str, str] = field(default_factory=dict)


@dataclass
class RenderResult:
    final_url: str
    status: str
    html: str
    duration_ms: int
    request_count: int
    console_logs: List[str]
    errors: List[str]


class PlaywrightRenderer:
    """Minimal headless renderer with a concurrency guard."""

    def __init__(self, max_concurrent: int = 2, default_timeout_ms: int = 20_000):
        self._sem = threading.Semaphore(max_concurrent)
        self._default_timeout = default_timeout_ms

    def render(self, req: RenderRequest) -> RenderResult:
        try:
            from playwright.sync_api import (
                Browser,
                Page,
                TimeoutError as PlaywrightTimeoutError,
                sync_playwright,
            )
        except ImportError as exc:  # pragma: no cover - import guard
            raise RuntimeError(
                "Playwright is not installed. Install with `pip install playwright` and "
                "run `playwright install chromium` in the worker image."
            ) from exc

        if not req.url.startswith(("http://", "https://")):
            raise ValueError(f"Invalid URL scheme for rendering: {req.url}")

        start = time.monotonic()
        request_count = 0
        console_logs: List[str] = []
        errors: List[str] = []
        status = "ok"
        html = ""

        headers = {**(req.headers or {})}

        with self._sem:
            with sync_playwright() as p:
                browser: Browser = p.chromium.launch(
                    headless=True,
                    args=[
                        "--disable-dev-shm-usage",
                        "--no-sandbox",
                    ],
                )
                context = browser.new_context(
                    user_agent="JobFinderBot/1.0",
                    viewport={"width": 1280, "height": 2000},
                    extra_http_headers=headers if headers else None,
                )
                page: Page = context.new_page()

                def log_console(msg):
                    # Limit console noise to short messages
                    text = msg.text()
                    if text:
                        console_logs.append(text[:500])

                page.on("console", log_console)

                def on_request(_):
                    nonlocal request_count
                    request_count += 1

                if req.block_resources:
                    page.route(
                        "**/*",
                        lambda route: (
                            route.abort()
                            if route.request.resource_type in BLOCKED_RESOURCE_TYPES
                            else route.continue_()
                        ),
                    )

                page.on("request", on_request)

                timeout = req.wait_timeout_ms or self._default_timeout
                final_url = req.url

                try:
                    page.goto(req.url, wait_until="networkidle", timeout=timeout)
                    if req.wait_for_selector:
                        page.wait_for_selector(req.wait_for_selector, timeout=timeout)
                    html = page.content()
                    final_url = page.url
                except PlaywrightTimeoutError as exc:
                    status = "timeout"
                    errors.append(str(exc)[:500])
                except Exception as exc:  # pragma: no cover - best-effort logging
                    status = "error"
                    errors.append(str(exc)[:500])
                finally:
                    context.close()
                    browser.close()

        duration_ms = int((time.monotonic() - start) * 1000)
        url_hash = hashlib.sha256(req.url.encode()).hexdigest()[:10]
        logger.info(
            "playwright_render status=%s url_hash=%s duration_ms=%s requests=%s errors=%s",
            status,
            url_hash,
            duration_ms,
            request_count,
            len(errors),
        )

        if status != "ok":
            raise RuntimeError(
                f"Render failed ({status}): {errors[0] if errors else 'unknown error'}"
            )

        return RenderResult(
            final_url=final_url,
            status=status,
            html=html,
            duration_ms=duration_ms,
            request_count=request_count,
            console_logs=console_logs[:10],
            errors=errors,
        )


# Singleton renderer used by the scraper
_renderer_singleton: Optional[PlaywrightRenderer] = None
_singleton_lock = threading.Lock()


def get_renderer() -> PlaywrightRenderer:
    global _renderer_singleton
    if _renderer_singleton:
        return _renderer_singleton
    with _singleton_lock:
        if not _renderer_singleton:
            _renderer_singleton = PlaywrightRenderer()
    return _renderer_singleton
