"""Lightweight Playwright renderer for JS-dependent sources.

MVP goals:
- Headless Chromium render with tight timeouts.
- Block heavy resources by default.
- Structured logging of duration, request count, and errors.
- Simple concurrency guard to avoid overloading the worker host.
- Hard timeout wrapper to prevent hung renders from blocking the worker.
"""

from __future__ import annotations

import hashlib
import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from dataclasses import dataclass, field
from typing import Dict, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:  # pragma: no cover - typing only
    from playwright.sync_api import Playwright, Browser

# Import PlaywrightTimeoutError at module level with fallback for when playwright
# is not installed (allows module to be imported without playwright)
try:
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
except ImportError:

    class PlaywrightTimeoutError(Exception):  # type: ignore[no-redef]
        """Placeholder exception for when playwright is not installed."""

        pass


logger = logging.getLogger(__name__)


BLOCKED_RESOURCE_TYPES = {"image", "font", "media", "stylesheet"}

# Hard timeout multiplier - if render takes longer than this multiple of the
# requested timeout, force-kill the context to prevent indefinite hangs
HARD_TIMEOUT_MULTIPLIER = 1.5
# Minimum hard timeout in ms to allow for slow initial page loads
MIN_HARD_TIMEOUT_MS = 30_000


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
    """Minimal headless renderer with a concurrency guard and health monitoring.

    IMPORTANT: Browser is created lazily on first render call to ensure it's
    created on the same thread that will use it. This prevents greenlet/threading
    conflicts when SQLAlchemy (which uses greenlet) is in use.
    """

    def __init__(self, max_concurrent: int = 2, default_timeout_ms: int = 20_000):
        self._sem = threading.Semaphore(max_concurrent)
        self._default_timeout = default_timeout_ms
        self._browser_lock = threading.Lock()
        self._playwright: Optional["Playwright"] = None
        self._browser: Optional["Browser"] = None
        self._browser_thread_id: Optional[int] = None  # Track which thread owns browser
        self._consecutive_failures = 0
        self._max_consecutive_failures = 3  # Restart browser after this many failures
        # DON'T create browser here - create lazily on first render to ensure
        # browser is created on the thread that will use it

    def _ensure_browser(self, force_restart: bool = False) -> None:
        """Start or restart the shared browser instance.

        IMPORTANT: Playwright browser must be created and used on the same thread.
        If called from a different thread than the one that created the browser,
        we force a restart to avoid greenlet/threading errors.
        """
        current_thread_id = threading.get_ident()

        with self._browser_lock:
            # Check if browser was created on a different thread - force restart if so
            # This prevents "Cannot switch to a different thread" greenlet errors
            if (
                self._browser is not None
                and self._browser_thread_id is not None
                and self._browser_thread_id != current_thread_id
            ):
                logger.info(
                    "playwright_thread_mismatch: browser created on thread %s, "
                    "current thread %s, forcing restart",
                    self._browser_thread_id,
                    current_thread_id,
                )
                force_restart = True

            # Skip is_connected check when force_restart is needed (e.g., thread mismatch).
            # Calling is_connected on a browser created on a dead thread throws
            # "cannot switch to a different thread" greenlet errors.
            if not force_restart:
                try:
                    is_connected = (
                        self._browser is not None
                        and getattr(self._browser, "is_connected", lambda: True)()
                    )
                except Exception:
                    is_connected = False
                if is_connected:
                    return

            # Clean up existing browser if present
            if self._browser is not None:
                try:
                    self._browser.close()
                except Exception:
                    pass
                self._browser = None
            if self._playwright is not None:
                try:
                    self._playwright.stop()
                except Exception:
                    pass
                self._playwright = None

            from playwright.sync_api import sync_playwright

            pw = sync_playwright().start()
            self._playwright = pw
            self._browser = pw.chromium.launch(
                headless=True,
                args=[
                    "--disable-dev-shm-usage",
                    "--no-sandbox",
                ],
            )
            # Track which thread created this browser
            self._browser_thread_id = current_thread_id

            if force_restart:
                logger.info("playwright_browser_restarted on thread %s", current_thread_id)

    def render(self, req: RenderRequest) -> RenderResult:
        if not req.url.startswith(("http://", "https://")):
            raise ValueError(f"Invalid URL scheme for rendering: {req.url}")

        # Track if we need to force restart due to consecutive failures
        # Note: Don't actually restart here - _ensure_browser is called from
        # within the ThreadPoolExecutor to ensure browser runs on correct thread
        force_restart_needed = self._consecutive_failures >= self._max_consecutive_failures
        if force_restart_needed:
            logger.warning(
                "playwright_health_check: %d consecutive failures, will restart browser",
                self._consecutive_failures,
            )
            self._consecutive_failures = 0

        start = time.monotonic()
        timeout = req.wait_timeout_ms or self._default_timeout

        # Calculate hard timeout - prevents indefinite hangs
        hard_timeout_ms = max(
            int(timeout * HARD_TIMEOUT_MULTIPLIER),
            MIN_HARD_TIMEOUT_MS,
        )
        hard_timeout_sec = hard_timeout_ms / 1000

        # Track context for cleanup on hard timeout
        render_context: Dict[str, Optional[object]] = {"context": None}

        # Run the actual render in a thread with hard timeout
        def _do_render():
            return self._render_internal(req, timeout, render_context, force_restart_needed)

        try:
            with ThreadPoolExecutor(max_workers=1) as executor:
                future = executor.submit(_do_render)
                result = future.result(timeout=hard_timeout_sec)

            # Success - reset failure counter
            self._consecutive_failures = 0
            return result

        except FuturesTimeoutError:
            # Hard timeout exceeded - browser likely hung
            # Try to clean up the abandoned context
            self._cleanup_abandoned_context(render_context)

            duration_ms = int((time.monotonic() - start) * 1000)
            url_hash = hashlib.sha256(req.url.encode()).hexdigest()[:10]
            logger.error(
                "playwright_render status=hard_timeout url_hash=%s duration_ms=%s hard_limit_ms=%s",
                url_hash,
                duration_ms,
                hard_timeout_ms,
            )
            self._consecutive_failures += 1
            raise RuntimeError(
                f"Render failed (hard_timeout): Exceeded {hard_timeout_sec}s hard limit"
            ) from None  # Suppress exception chaining

        except RuntimeError:
            # Normal render failure from _render_internal - track it
            self._consecutive_failures += 1
            raise

    def _cleanup_abandoned_context(self, render_context: Dict[str, Optional[object]]) -> None:
        """Attempt to close an abandoned browser context after hard timeout."""
        context = render_context.get("context")
        if context is not None:
            try:
                context.close()  # type: ignore[union-attr]
                logger.info("playwright_cleanup: closed abandoned context after hard timeout")
            except Exception as e:
                logger.warning("playwright_cleanup: failed to close abandoned context: %s", e)

    def _render_internal(
        self,
        req: RenderRequest,
        timeout: int,
        render_context: Dict[str, Optional[object]],
        force_restart: bool = False,
    ) -> RenderResult:
        """Internal render implementation - runs in thread with hard timeout.

        Args:
            req: The render request with URL and options
            timeout: Timeout in milliseconds for page load and selector wait
            render_context: Mutable dict to store context reference for cleanup on hard timeout
            force_restart: If True, force browser restart before rendering
        """
        start = time.monotonic()
        request_count = 0
        console_logs: List[str] = []
        errors: List[str] = []
        status = "ok"
        html = ""

        headers = {**(req.headers or {})}

        with self._sem:
            self._ensure_browser(force_restart=force_restart)
            context = self._browser.new_context(
                user_agent="JobFinderBot/1.0",
                viewport={"width": 1280, "height": 2000},
                extra_http_headers=headers if headers else None,
            )
            # Store context reference for cleanup on hard timeout
            render_context["context"] = context
            page = context.new_page()

            def log_console(msg):
                # Limit console noise to short messages
                # msg.text is a method in older Playwright, property in newer versions
                text = msg.text() if callable(msg.text) else msg.text
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

            final_url = req.url

            try:
                page.goto(req.url, wait_until="domcontentloaded", timeout=timeout)
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
                try:
                    context.close()
                except Exception:
                    pass  # Context close can fail if browser crashed
                # Clear context reference since it's now closed
                render_context["context"] = None

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

    def close(self) -> None:
        """Clean up browser and Playwright processes."""
        with self._browser_lock:
            if self._browser:
                try:
                    self._browser.close()
                except Exception:
                    pass
                self._browser = None
            if self._playwright:
                try:
                    self._playwright.stop()
                except Exception:
                    pass
                self._playwright = None

    def __del__(self):
        try:
            self.close()
        except Exception:
            # Destructors must never raise
            pass


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
