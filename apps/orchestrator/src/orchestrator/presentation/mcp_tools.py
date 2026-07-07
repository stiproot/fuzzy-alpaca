"""Curated agent tools — the effect edge for the MCP surface. Each returns a plain
JSON-serializable dict (Result mapped to `{"error": ...}` here — agents get data, not exceptions),
reusing the intelligence core. Read + research only; there is deliberately no order-placement tool,
so an agent can never route around the deterministic, gated money path."""

from __future__ import annotations

from typing import Any

from returns.pipeline import is_successful

from orchestrator.application.backtest import run_backtest
from orchestrator.application.gate import evaluate
from orchestrator.application.signals import STRATEGIES
from orchestrator.application.walkforward import walk_forward
from orchestrator.domain.backtest import BacktestConfig
from orchestrator.domain.gate import GateCriteria
from orchestrator.infrastructure.bars import lookback_start, url_symbol
from orchestrator.infrastructure.config import load_settings
from orchestrator.infrastructure.gateway import GatewayClient
from orchestrator.infrastructure.journal import DecisionsJournal


def _gateway() -> GatewayClient:
    s = load_settings()
    return GatewayClient(base_url=s.gateway_url, api_key=s.service_api_key)


async def _bars(symbol: str, timeframe: str, count: int) -> Any:
    start = lookback_start(timeframe, count)
    fetched = await _gateway().get_bars(
        url_symbol(symbol), timeframe, limit=min(1000, count * 2), start=start
    )
    return fetched.map(lambda bs: bs[-count:])


def list_strategies() -> dict[str, Any]:
    return {"strategies": sorted(STRATEGIES)}


async def account() -> dict[str, Any]:
    result = await _gateway().get_account()
    if not is_successful(result):
        return {"error": result.failure().message}
    return result.unwrap().model_dump()


async def positions() -> dict[str, Any]:
    result = await _gateway().get_positions_raw()
    if not is_successful(result):
        return {"error": result.failure().message}
    return {"positions": result.unwrap()}


async def market_snapshot(symbol: str) -> dict[str, Any]:
    result = await _gateway().get_snapshot_raw(url_symbol(symbol))
    if not is_successful(result):
        return {"error": result.failure().message}
    return result.unwrap()


async def bars(symbol: str, timeframe: str = "1Day", limit: int = 50) -> dict[str, Any]:
    result = await _bars(symbol, timeframe, limit)
    if not is_successful(result):
        return {"error": result.failure().message}
    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "bars": [b.model_dump() for b in result.unwrap()],
    }


async def backtest(
    strategy: str, symbol: str, timeframe: str = "1Day", bars_count: int = 200
) -> dict[str, Any]:
    if strategy not in STRATEGIES:
        return {"error": f"unknown strategy {strategy}; choose from {sorted(STRATEGIES)}"}
    fetched = await _bars(symbol, timeframe, bars_count)
    if not is_successful(fetched):
        return {"error": fetched.failure().message}
    r = run_backtest(strategy, symbol, fetched.unwrap(), STRATEGIES[strategy], BacktestConfig())
    return {
        "strategy": strategy, "symbol": symbol, "bars": r.bars,
        "total_return": r.total_return, "sharpe": r.sharpe,
        "max_drawdown": r.max_drawdown, "num_trades": r.num_trades, "win_rate": r.win_rate,
    }


async def evaluate_gate(
    strategy: str, symbol: str, timeframe: str = "1Day", bars_count: int = 200
) -> dict[str, Any]:
    if strategy not in STRATEGIES:
        return {"error": f"unknown strategy {strategy}; choose from {sorted(STRATEGIES)}"}
    fetched = await _bars(symbol, timeframe, bars_count)
    if not is_successful(fetched):
        return {"error": fetched.failure().message}
    oos = walk_forward(strategy, symbol, fetched.unwrap(), STRATEGIES[strategy], BacktestConfig())
    verdict = evaluate(oos, GateCriteria())
    return {
        "strategy": strategy, "symbol": symbol,
        "passed": verdict.passed, "reasons": list(verdict.reasons),
        "oos_return": oos.oos_return, "oos_sharpe": oos.oos_sharpe,
        "oos_max_drawdown": oos.oos_max_drawdown, "oos_trades": oos.oos_trades,
        "positive_folds_frac": oos.positive_folds_frac,
    }


async def recent_decisions(limit: int = 10) -> dict[str, Any]:
    result = await DecisionsJournal(load_settings().database_url).recent(limit)
    if not is_successful(result):
        return {"error": result.failure()}
    return {"decisions": result.unwrap()}
