"""The research use case — one agent tick: run the ReAct loop over the MCP tools, return the
result. Composition of pure loop + injected ports; persistence is the caller's edge concern."""

from __future__ import annotations

from orchestrator.application.agent_ports import LLMClient, ToolRegistry
from orchestrator.application.react import run_react
from orchestrator.application.signals import STRATEGIES
from orchestrator.domain.agent import ReactResult

SYSTEM_PROMPT = (
    "You are a trading-strategy research analyst for a paper-trading system. "
    "You have read-only market and research tools; you CANNOT place orders. "
    "Use the tools to investigate: check the market with market_snapshot/bars, backtest candidate "
    "strategies, and above all use evaluate_gate to see whether a strategy passes the "
    "out-of-sample gate for a symbol. A strategy may only be proposed if evaluate_gate reports "
    "passed=true. Investigate a few strategy/symbol combinations, then give a short final "
    "proposal: either name ONE strategy+symbol that cleared the gate and why, or state clearly "
    "that none qualified and no trade should be proposed. Be concise and evidence-based."
)


def _user_prompt(symbols: list[str]) -> str:
    strategies = ", ".join(sorted(STRATEGIES))
    syms = ", ".join(symbols)
    return (
        f"Research whether any strategy currently clears the gate. "
        f"Available strategies: {strategies}. Candidate symbols: {syms}. "
        f"Investigate and give your proposal."
    )


async def research_tick(
    llm: LLMClient,
    tools: ToolRegistry,
    symbols: list[str],
    max_turns: int = 8,
) -> ReactResult:
    return await run_react(llm, tools, SYSTEM_PROMPT, _user_prompt(symbols), max_turns=max_turns)
