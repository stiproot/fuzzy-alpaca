"""The ReAct loop — pure over the LLM and tool ports. generate → dispatch tool calls → repeat
until the model returns a final message or the turn budget runs out. No I/O of its own; the
effectful adapters are injected. Message threading uses OpenAI wire shape (plain dicts)."""

from __future__ import annotations

from typing import Any

from returns.pipeline import is_successful

from orchestrator.application.agent_ports import LLMClient, ToolRegistry
from orchestrator.domain.agent import ReactResult


async def run_react(
    llm: LLMClient,
    tools: ToolRegistry,
    system: str,
    user: str,
    max_turns: int = 8,
) -> ReactResult:
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    calls_made: list[str] = []
    schemas = tools.schemas()

    for turn in range(1, max_turns + 1):
        result = await llm.generate(messages, schemas)
        if not is_successful(result):
            return ReactResult(
                final=f"llm error: {result.failure()}",
                turns=turn,
                tool_calls_made=tuple(calls_made),
            )
        llm_turn = result.unwrap()

        if not llm_turn.tool_calls:
            return ReactResult(
                final=llm_turn.content or "",
                turns=turn,
                tool_calls_made=tuple(calls_made),
            )

        messages.append(llm_turn.assistant_message)
        for call in llm_turn.tool_calls:
            calls_made.append(call.name)
            output = await tools.dispatch(call.name, call.arguments)
            messages.append({"role": "tool", "tool_call_id": call.id, "content": output})

    return ReactResult(
        final="(reached max turns without a final answer)",
        turns=max_turns,
        tool_calls_made=tuple(calls_made),
    )
