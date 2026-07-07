"""Verify the research loop end-to-end WITHOUT an API key: a scripted stub LLM drives the real
MCP tool registry (against a running trading-mcp) and the real proposals repo. Proves the full
wiring — connect, tool-schema mapping, dispatch to real tools, proposal persistence.

  MCP_URL=http://localhost:8090/sse DATABASE_URL=... uv run python scripts/agent_verify.py"""

from __future__ import annotations

import asyncio
import os
from typing import Any

from returns.pipeline import is_successful
from returns.result import Result, Success

from orchestrator.application.research import research_tick
from orchestrator.domain.agent import LLMTurn, ToolCall
from orchestrator.infrastructure.mcp_registry import McpToolRegistry
from orchestrator.infrastructure.proposals import ProposalsRepo


class ScriptedLLM:
    """Turn 1: call evaluate_gate on a real strategy/symbol. Turn 2: propose based on the result."""

    def __init__(self) -> None:
        self._turn = 0
        self.last_tool_output: str | None = None

    async def generate(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]
    ) -> Result[LLMTurn, str]:
        self._turn += 1
        if self._turn == 1:
            names = [t["function"]["name"] for t in tools]
            assert "evaluate_gate" in names, f"MCP tools missing evaluate_gate: {names}"
            assert not any("place" in n or "order" in n for n in names), "placement tool leaked!"
            call = ToolCall(
                id="c1", name="evaluate_gate",
                arguments={"strategy": "sma_crossover", "symbol": "BTC/USD"},
            )
            return Success(
                LLMTurn(
                    content=None,
                    tool_calls=(call,),
                    assistant_message={
                        "role": "assistant",
                        "tool_calls": [
                            {
                                "id": "c1",
                                "type": "function",
                                "function": {
                                    "name": "evaluate_gate",
                                    "arguments": '{"strategy":"sma_crossover","symbol":"BTC/USD"}',
                                },
                            }
                        ],
                    },
                )
            )
        # turn 2: the previous message is the tool result
        self.last_tool_output = messages[-1]["content"]
        return Success(
            LLMTurn(
                content=f"Proposal: no strategy cleared the gate. Gate: {self.last_tool_output}",
                tool_calls=(),
                assistant_message={},
            )
        )


async def main() -> None:
    mcp_url = os.environ.get("MCP_URL", "http://localhost:8090/sse")
    dsn = os.environ.get("DATABASE_URL", "postgresql://alpaca:alpaca@localhost:5433/alpaca")

    llm = ScriptedLLM()
    async with McpToolRegistry(mcp_url) as tools:
        tool_names = [t["function"]["name"] for t in tools.schemas()]
        print(f"MCP tools seen by agent: {tool_names}")
        result = await research_tick(llm, tools, ["BTC/USD"])

    print(f"turns={result.turns} tool_calls={list(result.tool_calls_made)}")
    print(f"proposal: {result.final[:160]}")

    saved = await ProposalsRepo(dsn).record("stub-llm", result)
    assert is_successful(saved), f"persist failed: {saved.failure()}"
    print(f"persisted proposal #{saved.unwrap()}")
    assert result.tool_calls_made == ("evaluate_gate",)
    print("AGENT VERIFY OK")


if __name__ == "__main__":
    asyncio.run(main())
