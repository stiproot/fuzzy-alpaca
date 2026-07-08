"""strategy_tick — the Phase B deterministic pipeline: refresh bars → decide (signal + risk) →
execute if actionable → journal (always). Deterministic orchestration; all effects via activities,
the idempotency handshake reused from the trade path (clientOrderId = {instance_id}-place)."""

from __future__ import annotations

from collections.abc import Generator
from datetime import timedelta
from typing import Any

import dapr.ext.workflow as wf

from orchestrator.application.trade import POLL_SCHEDULE_SECONDS, is_terminal
from orchestrator.infrastructure.activities import (
    account_equity_activity,
    bootstrap_activity,
    decide_activity,
    gate_activity,
    journal_decision_activity,
    place_order_activity,
    poll_order_activity,
    refresh_bars_activity,
)

_PLACE_RETRY = wf.RetryPolicy(
    max_number_of_attempts=4,
    first_retry_interval=timedelta(seconds=1),
    backoff_coefficient=2.0,
)

# Enough history for the walk-forward gate (4 folds x warmup+room); live signals key off the tail.
_DEFAULT_NEED = 200


def strategy_tick(
    ctx: wf.DaprWorkflowContext, tick_input: dict[str, Any]
) -> Generator[Any, Any, dict[str, Any]]:
    strategy = tick_input["strategy"]
    symbol = tick_input["symbol"]
    timeframe = tick_input.get("timeframe", "1Day")
    limits = tick_input.get("limits", {})

    yield ctx.call_activity(bootstrap_activity)

    bars = yield ctx.call_activity(
        refresh_bars_activity,
        input={"symbol": symbol, "timeframe": timeframe, "need": _DEFAULT_NEED},
    )
    account = yield ctx.call_activity(account_equity_activity)

    decision = yield ctx.call_activity(
        decide_activity,
        input={
            "strategy": strategy,
            "symbol": symbol,
            "bars": bars,
            "equity": account["equity"],
            "limits": limits,
        },
    )

    order_id: str | None = None
    outcome = "hold"
    gate: dict[str, Any] | None = None
    if decision["action"] == "buy":
        # The gate is binding: an unproven strategy never reaches the money path.
        gate = yield ctx.call_activity(
            gate_activity,
            input={
                "strategy": strategy,
                "symbol": symbol,
                "timeframe": timeframe,
                "bars": bars,
                "criteria": tick_input.get("criteria", {}),
            },
        )
        if not gate["passed"]:
            outcome = "blocked:" + "; ".join(gate["reasons"])
            decision = {**decision, "action": "hold"}

    if decision["action"] == "buy":
        place_payload = {
            "instance_id": ctx.instance_id,
            "step": "place",
            "symbol": symbol,
            "side": "buy",
            "type": "market",
            "time_in_force": "gtc",
            "notional": decision["notional"],
        }
        order = yield ctx.call_activity(
            place_order_activity, input=place_payload, retry_policy=_PLACE_RETRY
        )
        order_id = order["order_id"]
        final = order
        for delay in POLL_SCHEDULE_SECONDS:
            if is_terminal(final["status"]):
                break
            yield ctx.create_timer(timedelta(seconds=delay))
            final = yield ctx.call_activity(
                poll_order_activity, input={"order_id": order_id}
            )
        outcome = final["status"]

    journalled = yield ctx.call_activity(
        journal_decision_activity,
        input={
            "strategy": strategy,
            "decision": decision,
            "order_id": order_id,
            "outcome": outcome,
        },
    )

    return {
        "action": decision["action"],
        "rationale": decision["rationale"],
        "order_id": order_id,
        "outcome": outcome,
        "decision_id": journalled["decision_id"],
        "gate": gate,
    }
