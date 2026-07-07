"""ReAct loop tests with a scripted stub LLM + stub tools — proves dispatch, message threading and
termination with no network."""

from __future__ import annotations

from typing import Any

from returns.result import Failure, Result, Success

from orchestrator.application.react import run_react
from orchestrator.domain.agent import LLMTurn, ToolCall


class StubTools:
    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def schemas(self) -> list[dict[str, Any]]:
        return [{"type": "function", "function": {"name": "evaluate_gate", "parameters": {}}}]

    async def dispatch(self, name: str, arguments: dict[str, Any]) -> str:
        self.calls.append((name, arguments))
        return '{"passed": false, "reasons": ["OOS sharpe too low"]}'


class ScriptedLLM:
    """Turn 1: call a tool. Turn 2: final answer."""

    def __init__(self) -> None:
        self._turn = 0

    async def generate(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]
    ) -> Result[LLMTurn, str]:
        self._turn += 1
        if self._turn == 1:
            call = ToolCall(id="c1", name="evaluate_gate", arguments={"strategy": "momentum"})
            return Success(
                LLMTurn(
                    content=None,
                    tool_calls=(call,),
                    assistant_message={"role": "assistant", "tool_calls": [{"id": "c1"}]},
                )
            )
        return Success(
            LLMTurn(
                content="No strategy cleared the gate; propose none.",
                tool_calls=(),
                assistant_message={},
            )
        )


class FailingLLM:
    async def generate(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]
    ) -> Result[LLMTurn, str]:
        return Failure("boom")


async def test_react_dispatches_then_answers() -> None:
    tools = StubTools()
    result = await run_react(ScriptedLLM(), tools, "sys", "research", max_turns=5)
    assert result.turns == 2
    assert result.tool_calls_made == ("evaluate_gate",)
    assert tools.calls == [("evaluate_gate", {"strategy": "momentum"})]
    assert "propose none" in result.final


async def test_react_surfaces_llm_error() -> None:
    result = await run_react(FailingLLM(), StubTools(), "sys", "u", max_turns=3)
    assert "llm error: boom" in result.final


class LoopingLLM:
    """Always calls a tool — never answers; exercises the max-turns guard."""

    async def generate(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]
    ) -> Result[LLMTurn, str]:
        call = ToolCall(id="c", name="evaluate_gate", arguments={})
        return Success(
            LLMTurn(content=None, tool_calls=(call,), assistant_message={"role": "assistant"})
        )


async def test_react_stops_at_max_turns() -> None:
    result = await run_react(LoopingLLM(), StubTools(), "sys", "u", max_turns=3)
    assert result.turns == 3
    assert "max turns" in result.final
    assert len(result.tool_calls_made) == 3
