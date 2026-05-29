"""
OpenWA Python SDK (Sprint 8, US-061).

Synchronous and asynchronous clients for the OpenWA WhatsApp API
gateway. Targets the public ``/v1/...`` surface and surfaces typed
exceptions so callers can handle auth, validation, rate-limit, and
server errors discretely.

Example::

    from openwa import OpenWAClient, OpenWAError

    client = OpenWAClient(base_url="https://api.openwa.io", api_key="...")
    try:
        client.sessions.create({"name": "main"})
    except OpenWAError as exc:
        print(exc.code, exc.message, exc.request_id)
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Optional

try:  # httpx is an optional runtime dep; we raise lazily on first call.
    import httpx as _httpx  # type: ignore
except ImportError:  # pragma: no cover
    _httpx = None  # type: ignore[assignment]


# ────────────────── errors ──────────────────


class OpenWAError(Exception):
    """Base class for all OpenWA API errors."""

    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        details: Any = None,
        request_id: Optional[str] = None,
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details
        self.request_id = request_id

    def __repr__(self) -> str:  # pragma: no cover - debug helper
        return (
            f"{self.__class__.__name__}(status={self.status}, code={self.code!r},"
            f" message={self.message!r}, request_id={self.request_id!r})"
        )


class AuthError(OpenWAError):
    pass


class ValidationError(OpenWAError):
    pass


class NotFoundError(OpenWAError):
    pass


class ConflictError(OpenWAError):
    pass


class RateLimitError(OpenWAError):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        retry_after_seconds: Optional[float] = None,
        details: Any = None,
        request_id: Optional[str] = None,
    ) -> None:
        super().__init__(status, code, message, details, request_id)
        self.retry_after_seconds = retry_after_seconds


class ServerError(OpenWAError):
    pass


def _classify(status: int, body: dict[str, Any], retry_after: Optional[float], request_id: Optional[str]) -> OpenWAError:
    err = body.get("error") or {}
    code = str(err.get("code") or "UNKNOWN_ERROR")
    msg = str(err.get("message") or "")
    details = err.get("details")
    if status == 400:
        return ValidationError(status, code, msg, details, request_id)
    if status in (401, 403):
        return AuthError(status, code, msg, details, request_id)
    if status == 404:
        return NotFoundError(status, code, msg, details, request_id)
    if status == 409:
        return ConflictError(status, code, msg, details, request_id)
    if status == 429:
        return RateLimitError(status, code, msg, retry_after, details, request_id)
    if status >= 500:
        return ServerError(status, code, msg, details, request_id)
    return OpenWAError(status, code, msg, details, request_id)


# ────────────────── config ──────────────────


@dataclass
class OpenWAClientConfig:
    base_url: str
    api_key: str
    timeout: float = 30.0


def _require_httpx() -> Any:
    if _httpx is None:
        raise ImportError(
            "httpx is required for the OpenWA SDK. "
            "Install it with: pip install openwa-sdk[httpx]"
        )
    return _httpx


def _headers(api_key: str, has_body: bool) -> dict[str, str]:
    h = {"X-API-Key": api_key}
    if has_body:
        h["Content-Type"] = "application/json"
    return h


# ────────────────── synchronous client ──────────────────


class OpenWAClient:
    """Synchronous client. Use ``AsyncOpenWAClient`` for asyncio."""

    def __init__(self, base_url: str, api_key: str, timeout: float = 30.0) -> None:
        self.config = OpenWAClientConfig(
            base_url=base_url.rstrip("/"),
            api_key=api_key,
            timeout=timeout,
        )

    # ── resources ──

    @property
    def sessions(self) -> "_Sessions":
        return _Sessions(self)

    @property
    def messages(self) -> "_Messages":
        return _Messages(self)

    @property
    def crm(self) -> "_Crm":
        return _Crm(self)

    @property
    def labels(self) -> "_Labels":
        return _Labels(self)

    @property
    def status(self) -> "_Status":
        return _Status(self)

    @property
    def settings(self) -> "_Settings":
        return _Settings(self)

    @property
    def plugins(self) -> "_Plugins":
        return _Plugins(self)

    @property
    def webhooks(self) -> "_Webhooks":
        return _Webhooks(self)

    # ── transport ──

    def _request(self, method: str, path: str, json: Any = None) -> Any:
        httpx = _require_httpx()
        with httpx.Client(timeout=self.config.timeout) as client:
            response = client.request(
                method,
                f"{self.config.base_url}{path}",
                headers=_headers(self.config.api_key, json is not None),
                json=json,
            )
            request_id = response.headers.get("x-request-id")
            if response.status_code == 204:
                return None
            if response.status_code >= 400:
                try:
                    body = response.json()
                except Exception:  # noqa: BLE001
                    body = {"error": {"code": "UNKNOWN_ERROR", "message": response.text}}
                ra_raw = response.headers.get("retry-after")
                ra: Optional[float] = None
                if ra_raw is not None:
                    try:
                        ra = float(ra_raw)
                    except ValueError:
                        ra = None
                raise _classify(response.status_code, body, ra, request_id)
            return response.json()


# ────────────────── async client ──────────────────


class AsyncOpenWAClient:
    """Asyncio variant of :class:`OpenWAClient`. Same surface, awaitable methods."""

    def __init__(self, base_url: str, api_key: str, timeout: float = 30.0) -> None:
        self.config = OpenWAClientConfig(
            base_url=base_url.rstrip("/"),
            api_key=api_key,
            timeout=timeout,
        )

    @property
    def sessions(self) -> "_AsyncSessions":
        return _AsyncSessions(self)

    @property
    def messages(self) -> "_AsyncMessages":
        return _AsyncMessages(self)

    @property
    def crm(self) -> "_AsyncCrm":
        return _AsyncCrm(self)

    @property
    def labels(self) -> "_AsyncLabels":
        return _AsyncLabels(self)

    @property
    def status(self) -> "_AsyncStatus":
        return _AsyncStatus(self)

    @property
    def settings(self) -> "_AsyncSettings":
        return _AsyncSettings(self)

    @property
    def plugins(self) -> "_AsyncPlugins":
        return _AsyncPlugins(self)

    @property
    def webhooks(self) -> "_AsyncWebhooks":
        return _AsyncWebhooks(self)

    async def _request(self, method: str, path: str, json: Any = None) -> Any:
        httpx = _require_httpx()
        async with httpx.AsyncClient(timeout=self.config.timeout) as client:
            response = await client.request(
                method,
                f"{self.config.base_url}{path}",
                headers=_headers(self.config.api_key, json is not None),
                json=json,
            )
            request_id = response.headers.get("x-request-id")
            if response.status_code == 204:
                return None
            if response.status_code >= 400:
                try:
                    body = response.json()
                except Exception:  # noqa: BLE001
                    body = {"error": {"code": "UNKNOWN_ERROR", "message": response.text}}
                ra_raw = response.headers.get("retry-after")
                ra: Optional[float] = None
                if ra_raw is not None:
                    try:
                        ra = float(ra_raw)
                    except ValueError:
                        ra = None
                raise _classify(response.status_code, body, ra, request_id)
            return response.json()


# ────────────────── resource mixins ──────────────────


def _qs(params: Optional[dict[str, Any]]) -> str:
    if not params:
        return ""
    pairs = [(k, str(v)) for k, v in params.items() if v is not None]
    if not pairs:
        return ""
    from urllib.parse import urlencode

    return "?" + urlencode(pairs)


class _SyncBase:
    def __init__(self, client: OpenWAClient) -> None:
        self._c = client

    def _req(self, method: str, path: str, json: Any = None) -> Any:
        return self._c._request(method, path, json)


class _AsyncBase:
    def __init__(self, client: AsyncOpenWAClient) -> None:
        self._c = client

    async def _req(self, method: str, path: str, json: Any = None) -> Any:
        return await self._c._request(method, path, json)


# ── sessions ──

class _Sessions(_SyncBase):
    def list(self) -> Any:
        return self._req("GET", "/v1/sessions")

    def get(self, session_id: str) -> Any:
        return self._req("GET", f"/v1/sessions/{session_id}")

    def create(self, data: dict) -> Any:
        return self._req("POST", "/v1/sessions", data)

    def delete(self, session_id: str) -> None:
        self._req("DELETE", f"/v1/sessions/{session_id}")


class _AsyncSessions(_AsyncBase):
    async def list(self) -> Any:
        return await self._req("GET", "/v1/sessions")

    async def get(self, session_id: str) -> Any:
        return await self._req("GET", f"/v1/sessions/{session_id}")

    async def create(self, data: dict) -> Any:
        return await self._req("POST", "/v1/sessions", data)

    async def delete(self, session_id: str) -> None:
        await self._req("DELETE", f"/v1/sessions/{session_id}")


# ── messages ──

class _Messages(_SyncBase):
    def send_text(self, session_id: str, data: dict) -> Any:
        return self._req("POST", f"/v1/sessions/{session_id}/messages/text", data)


class _AsyncMessages(_AsyncBase):
    async def send_text(self, session_id: str, data: dict) -> Any:
        return await self._req("POST", f"/v1/sessions/{session_id}/messages/text", data)


# ── crm ──

class _Crm(_SyncBase):
    def list_contacts(self, **q: Any) -> Any:
        return self._req("GET", "/v1/crm/contacts" + _qs(q))

    def create_contact(self, data: dict) -> Any:
        return self._req("POST", "/v1/crm/contacts", data)

    def list_tags(self) -> Any:
        return self._req("GET", "/v1/crm/tags")

    def list_templates(self) -> Any:
        return self._req("GET", "/v1/crm/templates")


class _AsyncCrm(_AsyncBase):
    async def list_contacts(self, **q: Any) -> Any:
        return await self._req("GET", "/v1/crm/contacts" + _qs(q))

    async def create_contact(self, data: dict) -> Any:
        return await self._req("POST", "/v1/crm/contacts", data)

    async def list_tags(self) -> Any:
        return await self._req("GET", "/v1/crm/tags")

    async def list_templates(self) -> Any:
        return await self._req("GET", "/v1/crm/templates")


# ── labels ──

class _Labels(_SyncBase):
    def list(self) -> Any:
        return self._req("GET", "/v1/labels")

    def create(self, data: dict) -> Any:
        return self._req("POST", "/v1/labels", data)

    def update(self, label_id: str, data: dict) -> Any:
        return self._req("PATCH", f"/v1/labels/{label_id}", data)

    def delete(self, label_id: str) -> None:
        self._req("DELETE", f"/v1/labels/{label_id}")

    def assign(self, contact_id: str, label_ids: list[str]) -> Any:
        return self._req("POST", f"/v1/contacts/{contact_id}/labels", {"labelIds": label_ids})

    def remove(self, contact_id: str, label_id: str) -> None:
        self._req("DELETE", f"/v1/contacts/{contact_id}/labels/{label_id}")

    def bulk(self, data: dict) -> Any:
        return self._req("POST", "/v1/labels/bulk", data)


class _AsyncLabels(_AsyncBase):
    async def list(self) -> Any:
        return await self._req("GET", "/v1/labels")

    async def create(self, data: dict) -> Any:
        return await self._req("POST", "/v1/labels", data)

    async def update(self, label_id: str, data: dict) -> Any:
        return await self._req("PATCH", f"/v1/labels/{label_id}", data)

    async def delete(self, label_id: str) -> None:
        await self._req("DELETE", f"/v1/labels/{label_id}")

    async def bulk(self, data: dict) -> Any:
        return await self._req("POST", "/v1/labels/bulk", data)


# ── status / stories ──

class _Status(_SyncBase):
    def list(self, **q: Any) -> Any:
        return self._req("GET", "/v1/status" + _qs(q))

    def post_text(self, data: dict) -> Any:
        return self._req("POST", "/v1/status/text", data)

    def post_media(self, data: dict) -> Any:
        return self._req("POST", "/v1/status/media", data)

    def get(self, status_id: str) -> Any:
        return self._req("GET", f"/v1/status/{status_id}")

    def delete(self, status_id: str) -> None:
        self._req("DELETE", f"/v1/status/{status_id}")

    def views(self, status_id: str) -> Any:
        return self._req("GET", f"/v1/status/{status_id}/views")

    def record_view(self, status_id: str, viewer_jid: str) -> Any:
        return self._req("POST", f"/v1/status/{status_id}/views", {"viewerJid": viewer_jid})


class _AsyncStatus(_AsyncBase):
    async def list(self, **q: Any) -> Any:
        return await self._req("GET", "/v1/status" + _qs(q))

    async def post_text(self, data: dict) -> Any:
        return await self._req("POST", "/v1/status/text", data)

    async def post_media(self, data: dict) -> Any:
        return await self._req("POST", "/v1/status/media", data)


# ── settings ──

class _Settings(_SyncBase):
    def get(self) -> Any:
        return self._req("GET", "/v1/settings")

    def update(self, data: dict) -> Any:
        return self._req("PATCH", "/v1/settings", data)


class _AsyncSettings(_AsyncBase):
    async def get(self) -> Any:
        return await self._req("GET", "/v1/settings")

    async def update(self, data: dict) -> Any:
        return await self._req("PATCH", "/v1/settings", data)


# ── plugins ──

class _Plugins(_SyncBase):
    def list(self) -> Any:
        return self._req("GET", "/v1/plugins")

    def install(self, data: dict) -> Any:
        return self._req("POST", "/v1/plugins", data)

    def update(self, plugin_id: str, data: dict) -> Any:
        return self._req("PATCH", f"/v1/plugins/{plugin_id}", data)

    def uninstall(self, plugin_id: str) -> None:
        self._req("DELETE", f"/v1/plugins/{plugin_id}")


class _AsyncPlugins(_AsyncBase):
    async def list(self) -> Any:
        return await self._req("GET", "/v1/plugins")

    async def install(self, data: dict) -> Any:
        return await self._req("POST", "/v1/plugins", data)

    async def update(self, plugin_id: str, data: dict) -> Any:
        return await self._req("PATCH", f"/v1/plugins/{plugin_id}", data)

    async def uninstall(self, plugin_id: str) -> None:
        await self._req("DELETE", f"/v1/plugins/{plugin_id}")


# ── webhooks ──

class _Webhooks(_SyncBase):
    def list(self) -> Any:
        return self._req("GET", "/v1/webhooks")

    def create(self, data: dict) -> Any:
        return self._req("POST", "/v1/webhooks", data)

    def delete(self, webhook_id: str) -> None:
        self._req("DELETE", f"/v1/webhooks/{webhook_id}")


class _AsyncWebhooks(_AsyncBase):
    async def list(self) -> Any:
        return await self._req("GET", "/v1/webhooks")

    async def create(self, data: dict) -> Any:
        return await self._req("POST", "/v1/webhooks", data)

    async def delete(self, webhook_id: str) -> None:
        await self._req("DELETE", f"/v1/webhooks/{webhook_id}")


__all__ = [
    "OpenWAClient",
    "AsyncOpenWAClient",
    "OpenWAClientConfig",
    "OpenWAError",
    "AuthError",
    "ValidationError",
    "NotFoundError",
    "ConflictError",
    "RateLimitError",
    "ServerError",
]

# Sentinel reference to keep type-checkers from flagging unused imports.
_ASYNC_CALLABLE: Callable[..., Awaitable[Any]] = AsyncOpenWAClient._request  # noqa: SLF001
