"""Dapr state journal — the orders mirror, written through the Dapr state API (Postgres-backed
component). Effect edge: httpx failures are caught into a Result. Implements JournalPort."""

from __future__ import annotations

import httpx
from returns.result import Failure, Result, Success

from orchestrator.domain.models import Order


class DaprJournal:
    def __init__(self, state_url: str, timeout: float = 10.0) -> None:
        # state_url e.g. http://localhost:3510/v1.0/state/statestore
        self._url = state_url.rstrip("/")
        self._timeout = timeout

    async def record_order(self, order: Order) -> Result[None, str]:
        record = {"key": f"order:{order.order_id}", "value": order.model_dump()}
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(self._url, json=[record])
                resp.raise_for_status()
        except httpx.HTTPError as exc:
            return Failure(f"journal record_order: {exc}")
        return Success(None)
