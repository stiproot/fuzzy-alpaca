"""HTTP host for the Dapr Workflow runtime. Registers the workflow + activities, starts the
worker on lifespan, and exposes minimal endpoints to schedule and inspect trade workflows.

This is the driving-adapter edge; the deterministic workflow and effectful activities it hosts
live in infrastructure/."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import dapr.ext.workflow as wf
from fastapi import FastAPI
from pydantic import BaseModel

from orchestrator.infrastructure.activities import (
    bootstrap_activity,
    journal_activity,
    place_order_activity,
    poll_order_activity,
)
from orchestrator.infrastructure.workflow import trade_lifecycle

_runtime = wf.WorkflowRuntime()
_runtime.register_workflow(trade_lifecycle)
for _activity in (bootstrap_activity, place_order_activity, poll_order_activity, journal_activity):
    _runtime.register_activity(_activity)


@asynccontextmanager
async def _lifespan(_app: FastAPI) -> AsyncIterator[None]:
    _runtime.start()  # type: ignore[no-untyped-call]
    try:
        yield
    finally:
        _runtime.shutdown()  # type: ignore[no-untyped-call]


app = FastAPI(title="fuzzy-alpaca orchestrator", lifespan=_lifespan)


class TradeRequest(BaseModel):
    symbol: str
    side: str = "buy"
    type: str = "market"
    time_in_force: str = "gtc"
    qty: str | None = None
    notional: str | None = None


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/trades")
def start_trade(req: TradeRequest) -> dict[str, str]:
    client = wf.DaprWorkflowClient()
    instance_id = client.schedule_new_workflow(
        workflow=trade_lifecycle,
        input=req.model_dump(exclude_none=True),
    )
    return {"instance_id": instance_id}


@app.get("/trades/{instance_id}")
def trade_status(instance_id: str) -> dict[str, Any]:
    client = wf.DaprWorkflowClient()
    state = client.get_workflow_state(instance_id)
    if state is None:
        return {"instance_id": instance_id, "found": False}
    return {
        "instance_id": instance_id,
        "found": True,
        "runtime_status": state.runtime_status.name,
        "serialized_output": state.serialized_output,
    }
