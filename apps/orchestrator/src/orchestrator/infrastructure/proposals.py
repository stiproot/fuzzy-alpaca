"""Proposals persistence — the agent proposes; a human or a later gated step promotes. Never an
order. Stores the final proposal, model, turn count, and the tool calls the agent made (audit)."""

from __future__ import annotations

import json

from returns.result import Failure, Result, Success

from orchestrator.domain.agent import ReactResult
from orchestrator.infrastructure.db import connect


class ProposalsRepo:
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn

    async def record(self, model: str, result: ReactResult) -> Result[int, str]:
        tool_calls = json.dumps(list(result.tool_calls_made))
        try:
            conn = await connect(self._dsn)
            try:
                row_id: int = await conn.fetchval(
                    "INSERT INTO proposals (model, turns, proposal, tool_calls) "
                    "VALUES ($1,$2,$3,$4) RETURNING id",
                    model, result.turns, result.final, tool_calls,
                )
            finally:
                await conn.close()
        except Exception as exc:  # noqa: BLE001
            return Failure(f"proposals insert: {exc}")
        return Success(row_id)
