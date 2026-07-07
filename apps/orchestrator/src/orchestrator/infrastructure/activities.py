"""Dapr workflow activities — the effect edge. Each is a deterministic-input sync function that
bridges to the async adapters and returns plain serializable dicts (Result stays inside the
adapters; the workflow boundary speaks JSON). Business/transport failures raise so Dapr's retry
policy re-runs the activity — which is SAFE for placement because the re-derived clientOrderId
triggers idempotent replay rather than a second order."""

from __future__ import annotations

import asyncio
from typing import Any

import dapr.ext.workflow as wf
from returns.pipeline import is_successful
from returns.result import Result

from orchestrator.domain.ids import client_order_id
from orchestrator.domain.models import Order, PlaceOrder, Whoami
from orchestrator.infrastructure.config import load_settings
from orchestrator.infrastructure.gateway import GatewayClient
from orchestrator.infrastructure.state import DaprJournal


def _gateway() -> GatewayClient:
    s = load_settings()
    return GatewayClient(base_url=s.gateway_url, api_key=s.service_api_key)


def _journal() -> DaprJournal:
    return DaprJournal(state_url=load_settings().state_url)


def _unwrap_order(result: Result[Order, Any], op: str) -> Order:
    if is_successful(result):
        return result.unwrap()
    err = result.failure()
    raise RuntimeError(f"{op} {err.code}: {err.message} (retryable={err.retryable})")


def bootstrap_activity(_ctx: wf.WorkflowActivityContext, _input: Any) -> dict[str, Any]:
    result: Result[Whoami, Any] = asyncio.run(_gateway().get_whoami())
    if not is_successful(result):
        err = result.failure()
        raise RuntimeError(f"bootstrap failed: {err.code} {err.message}")
    whoami = result.unwrap()
    if whoami.trading_mode != "paper":
        raise RuntimeError(f"refusing to run: trading_mode={whoami.trading_mode}")
    return whoami.model_dump()


def place_order_activity(
    _ctx: wf.WorkflowActivityContext, payload: dict[str, Any]
) -> dict[str, Any]:
    order = PlaceOrder(
        symbol=payload["symbol"],
        side=payload["side"],
        type=payload["type"],
        time_in_force=payload["time_in_force"],
        client_order_id=client_order_id(payload["instance_id"], payload["step"]),
        qty=payload.get("qty"),
        notional=payload.get("notional"),
        limit_price=payload.get("limit_price"),
        stop_price=payload.get("stop_price"),
    )
    placed = _unwrap_order(asyncio.run(_gateway().place_order(order)), "place_order")
    return placed.model_dump()


def poll_order_activity(
    _ctx: wf.WorkflowActivityContext, payload: dict[str, Any]
) -> dict[str, Any]:
    order = _unwrap_order(asyncio.run(_gateway().get_order(payload["order_id"])), "poll_order")
    return order.model_dump()


def journal_activity(
    _ctx: wf.WorkflowActivityContext, order_dict: dict[str, Any]
) -> dict[str, Any]:
    result = asyncio.run(_journal().record_order(Order(**order_dict)))
    if not is_successful(result):
        raise RuntimeError(result.failure())
    return {"journaled": True, "order_id": order_dict["order_id"]}
