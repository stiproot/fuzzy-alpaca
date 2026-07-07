"""trading-mcp — the curated agent surface. Registers the read + research tools with FastMCP and
serves them over SSE. No order-placement tool: agents research and propose; the gated workflow
executes. Composition root: `python -m orchestrator.presentation.mcp_server`."""

from __future__ import annotations

import os
from typing import Any

from mcp.server.fastmcp import FastMCP

from orchestrator.presentation import mcp_tools

mcp = FastMCP(
    "trading-mcp",
    instructions=(
        "Curated trading research tools over the fuzzy-alpaca gateway. Use these to inspect the "
        "market and evaluate strategies out-of-sample. There is no order-placement tool by "
        "design: propose strategies that clear evaluate_gate; the deterministic workflow executes."
    ),
    host=os.environ.get("MCP_HOST", "0.0.0.0"),  # noqa: S104 — container service
    port=int(os.environ.get("MCP_PORT", "8090")),
)


@mcp.tool()
def list_strategies() -> dict[str, Any]:
    """List the available trading strategies."""
    return mcp_tools.list_strategies()


@mcp.tool()
async def account() -> dict[str, Any]:
    """Account buying power and equity."""
    return await mcp_tools.account()


@mcp.tool()
async def positions() -> dict[str, Any]:
    """Current open positions with P&L."""
    return await mcp_tools.positions()


@mcp.tool()
async def market_snapshot(symbol: str) -> dict[str, Any]:
    """Latest quote, trade, and recent bars for a symbol (e.g. BTC/USD, AAPL)."""
    return await mcp_tools.market_snapshot(symbol)


@mcp.tool()
async def bars(symbol: str, timeframe: str = "1Day", limit: int = 50) -> dict[str, Any]:
    """Historical OHLCV bars for a symbol."""
    return await mcp_tools.bars(symbol, timeframe, limit)


@mcp.tool()
async def backtest(
    strategy: str, symbol: str, timeframe: str = "1Day", bars_count: int = 200
) -> dict[str, Any]:
    """Full-sample backtest of a strategy (return, Sharpe, drawdown) with fees + slippage."""
    return await mcp_tools.backtest(strategy, symbol, timeframe, bars_count)


@mcp.tool()
async def evaluate_gate(
    strategy: str, symbol: str, timeframe: str = "1Day", bars_count: int = 200
) -> dict[str, Any]:
    """Out-of-sample walk-forward gate verdict: whether this strategy may trade live, and why."""
    return await mcp_tools.evaluate_gate(strategy, symbol, timeframe, bars_count)


@mcp.tool()
async def recent_decisions(limit: int = 10) -> dict[str, Any]:
    """The most recent strategy decisions from the journal (including blocked/held)."""
    return await mcp_tools.recent_decisions(limit)


def run() -> None:
    mcp.run(transport="sse")


if __name__ == "__main__":
    run()
