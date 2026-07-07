"""Tests for the offline-decidable MCP tools. Gateway-backed tools are covered by the live check."""

from orchestrator.presentation import mcp_tools


def test_list_strategies() -> None:
    out = mcp_tools.list_strategies()
    assert set(out["strategies"]) == {"sma_crossover", "momentum", "mean_reversion"}


async def test_backtest_unknown_strategy_returns_error() -> None:
    out = await mcp_tools.backtest("does_not_exist", "BTC/USD")
    assert "error" in out
    assert "unknown strategy" in out["error"]


async def test_evaluate_gate_unknown_strategy_returns_error() -> None:
    out = await mcp_tools.evaluate_gate("nope", "BTC/USD")
    assert "error" in out


def test_no_placement_tool_exposed() -> None:
    # The curated surface must never expose order placement.
    names = {n for n in dir(mcp_tools) if not n.startswith("_")}
    assert not any("place" in n or "order" in n for n in names)
