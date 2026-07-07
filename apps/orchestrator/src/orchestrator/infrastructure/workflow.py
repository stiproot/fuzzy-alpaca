"""The trade-lifecycle workflow — deterministic orchestration. Must contain no I/O and no
wall-clock/random calls; all effects go through call_activity, all waits through create_timer.
The idempotency handshake is proven inline: placing twice under the same step id yields the same
order with idempotent_replay=true on the second call."""

from __future__ import annotations

from collections.abc import Generator
from datetime import timedelta
from typing import Any

import dapr.ext.workflow as wf

from orchestrator.application.trade import POLL_SCHEDULE_SECONDS, is_terminal
from orchestrator.infrastructure.activities import (
    bootstrap_activity,
    journal_activity,
    place_order_activity,
    poll_order_activity,
)

_PLACE_RETRY = wf.RetryPolicy(
    max_number_of_attempts=4,
    first_retry_interval=timedelta(seconds=1),
    backoff_coefficient=2.0,
)


def trade_lifecycle(
    ctx: wf.DaprWorkflowContext, order_input: dict[str, Any]
) -> Generator[Any, Any, dict[str, Any]]:
    # 1. bootstrap — assert paper mode, read the account
    yield ctx.call_activity(bootstrap_activity)

    # 2. place — clientOrderId derived from (instance_id, step) is stable across replays
    place_payload = {
        "instance_id": ctx.instance_id,
        "step": "place",
        **order_input,
    }
    order = yield ctx.call_activity(
        place_order_activity, input=place_payload, retry_policy=_PLACE_RETRY
    )

    # 3. idempotency proof — same step id → same clientOrderId → gateway replays the same order
    replay = yield ctx.call_activity(
        place_order_activity, input=place_payload, retry_policy=_PLACE_RETRY
    )
    replay_confirmed = (
        replay["order_id"] == order["order_id"] and replay["idempotent_replay"] is True
    )

    # 4. poll the fill through the expanding backoff, stopping at a terminal status
    final = order
    for delay in POLL_SCHEDULE_SECONDS:
        if is_terminal(final["status"]):
            break
        yield ctx.create_timer(timedelta(seconds=delay))
        final = yield ctx.call_activity(
            poll_order_activity, input={"order_id": order["order_id"]}
        )

    # 5. journal the outcome
    yield ctx.call_activity(journal_activity, input=final)

    return {
        "order_id": final["order_id"],
        "client_order_id": final["client_order_id"],
        "status": final["status"],
        "filled_qty": final["filled_qty"],
        "replay_confirmed": replay_confirmed,
    }
