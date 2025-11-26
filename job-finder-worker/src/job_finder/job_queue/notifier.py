"""Bridge to the Node API for queue events and commands (WebSocket + HTTP fallback).

Env:
- JF_NODE_API_BASE (default: http://localhost:8080/api)
- JF_NODE_API_TOKEN (optional bearer token)
- JF_WORKER_ID (default: "default")
"""

from __future__ import annotations

import logging
import os
import json
from typing import Any, Callable, Dict, List, Optional

import requests
import threading
import time

try:  # optional dependency for WS commands
    import websocket  # type: ignore[import-untyped]
except Exception:  # pragma: no cover - optional
    websocket = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)


def _base_url() -> str:
    return os.getenv("JF_NODE_API_BASE", "http://localhost:8080/api")


def _token() -> Optional[str]:
    return os.getenv("JF_NODE_API_TOKEN")


def _worker_ws_token() -> Optional[str]:
    return os.getenv("JF_WORKER_WS_TOKEN") or os.getenv("JF_NODE_API_TOKEN")


def _worker_id() -> str:
    return os.getenv("JF_WORKER_ID", "default")


class QueueEventNotifier:
    def __init__(
        self,
        worker_id: Optional[str] = None,
        on_command: Optional[Callable[[Dict[str, Any]], None]] = None,
    ):
        self.base = _base_url().rstrip("/")
        self.token = _token()
        self.worker_id = worker_id or _worker_id()
        self.on_command = on_command
        self._ws_thread: Optional[threading.Thread] = None
        self._ws_stop = threading.Event()
        self._has_ws = websocket is not None
        self._ws_app = None
        self._ws_connected = False
        if self._has_ws:
            self._start_ws()

    def _headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def _ws_url(self) -> str:
        # convert http(s) -> ws(s) and strip /api
        http_base = self.base
        ws_base = http_base.replace("https://", "wss://").replace("http://", "ws://")
        if ws_base.endswith("/api"):
            ws_base = ws_base[:-4]
        return f"{ws_base}/worker/stream"

    def _start_ws(self) -> None:
        def run():  # pragma: no cover - background thread
            while not self._ws_stop.is_set():
                try:
                    self._ws_app = websocket.WebSocketApp(  # type: ignore
                        self._ws_url(),
                        header=(
                            [f"Authorization: Bearer {_worker_ws_token()}"]
                            if _worker_ws_token()
                            else None
                        ),
                        on_open=lambda *_: self._on_ws_open(),
                        on_message=self._handle_ws_message,
                        on_close=lambda *_: self._on_ws_close(),
                        on_error=lambda *_ws, err=None: logger.debug("WS error: %s", err),
                    )
                    self._ws_app.run_forever(ping_interval=20, ping_timeout=10)
                except Exception as exc:
                    logger.debug("QueueEventNotifier WS error: %s", exc)
                time.sleep(3)

        self._ws_thread = threading.Thread(target=run, daemon=True)
        self._ws_thread.start()

    def _on_ws_open(self):  # pragma: no cover
        self._ws_connected = True
        logger.debug("QueueEventNotifier WS connected")

    def _on_ws_close(self):  # pragma: no cover
        self._ws_connected = False
        logger.debug("QueueEventNotifier WS closed")

    def _handle_ws_message(self, _ws, message: str):  # pragma: no cover - runtime path
        try:
            payload = json.loads(message)
            if payload.get("event", "").startswith("command") and self.on_command:
                self.on_command(payload)
        except Exception as exc:
            logger.debug("QueueEventNotifier WS message parse error: %s", exc)

    def close(self):
        self._ws_stop.set()

    def send_event(self, event: str, data: Dict[str, Any]) -> None:
        payload = {"event": event, "data": {**data, "workerId": self.worker_id}}
        if self._ws_app and self._ws_connected:
            try:
                self._ws_app.send(json.dumps(payload))
                return
            except Exception as exc:  # pragma: no cover
                logger.debug("QueueEventNotifier WS send failed, falling back to HTTP: %s", exc)

        url = f"{self.base}/queue/worker/events"
        try:
            resp = requests.post(url, json=payload, headers=self._headers(), timeout=5)
            if resp.status_code >= 300:
                logger.debug(
                    "QueueEventNotifier send_event failed: %s %s", resp.status_code, resp.text
                )
        except Exception as exc:  # pragma: no cover - defensive
            logger.debug("QueueEventNotifier send_event error: %s", exc)

    def poll_commands(self) -> List[Dict[str, Any]]:
        # Fallback when WS is unavailable
        url = f"{self.base}/queue/worker/commands"
        try:
            resp = requests.get(
                url, params={"workerId": self.worker_id}, headers=self._headers(), timeout=5
            )
            if resp.status_code >= 300:
                logger.debug(
                    "QueueEventNotifier poll_commands failed: %s %s", resp.status_code, resp.text
                )
                return []
            data = resp.json()
            return data.get("data", {}).get("commands", [])  # api success wrapper
        except Exception as exc:  # pragma: no cover - defensive
            logger.debug("QueueEventNotifier poll_commands error: %s", exc)
            return []

    @property
    def ws_connected(self) -> bool:
        return bool(self._ws_connected)
