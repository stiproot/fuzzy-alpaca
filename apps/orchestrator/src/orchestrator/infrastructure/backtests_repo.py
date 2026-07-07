"""Persist backtest results — the gate a strategy passes before it earns paper/live capital."""

from __future__ import annotations

import json

from returns.result import Failure, Result, Success

from orchestrator.domain.backtest import BacktestConfig, BacktestResult
from orchestrator.infrastructure.db import connect


class BacktestsRepo:
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn

    async def record(
        self, result: BacktestResult, timeframe: str, config: BacktestConfig
    ) -> Result[int, str]:
        cfg = json.dumps(config.model_dump())
        try:
            conn = await connect(self._dsn)
            try:
                row_id: int = await conn.fetchval(
                    "INSERT INTO backtests "
                    "(strategy, symbol, timeframe, bars, total_return, sharpe, max_drawdown, "
                    "num_trades, win_rate, config) "
                    "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
                    result.strategy, result.symbol, timeframe, result.bars,
                    result.total_return, result.sharpe, result.max_drawdown,
                    result.num_trades, result.win_rate, cfg,
                )
            finally:
                await conn.close()
        except Exception as exc:  # noqa: BLE001
            return Failure(f"backtests insert: {exc}")
        return Success(row_id)
