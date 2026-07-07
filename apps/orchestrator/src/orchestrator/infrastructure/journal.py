"""Decisions journal — every strategy tick writes one row (holds included). This is the record
that lets us later evaluate whether the intelligence adds value (join decisions → orders → P&L).
Direct SQL, since analytics wants relational queries the Dapr KV API can't serve."""

from __future__ import annotations

import json

from returns.result import Failure, Result, Success

from orchestrator.domain.strategy import StrategyDecision
from orchestrator.infrastructure.db import connect


class DecisionsJournal:
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn

    async def record(
        self,
        strategy: str,
        decision: StrategyDecision,
        order_id: str | None,
        outcome: str | None,
    ) -> Result[int, str]:
        inputs = json.dumps({"signal": decision.signal.model_dump()})
        try:
            conn = await connect(self._dsn)
            try:
                row_id: int = await conn.fetchval(
                    "INSERT INTO decisions "
                    "(strategy, symbol, action, notional, rationale, inputs, order_id, outcome) "
                    "VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
                    strategy, decision.symbol, decision.action, decision.notional,
                    decision.rationale, inputs, order_id, outcome,
                )
            finally:
                await conn.close()
        except Exception as exc:  # noqa: BLE001 — DB edge, surfaced as Result
            return Failure(f"journal insert: {exc}")
        return Success(row_id)
