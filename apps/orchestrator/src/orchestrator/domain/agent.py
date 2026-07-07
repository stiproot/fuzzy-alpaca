"""Agent domain — the ReAct loop's value types. Frozen; the loop (application/react) is pure over
the LLM and tool ports."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class Frozen(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class ToolCall(Frozen):
    id: str
    name: str
    arguments: dict[str, Any]


class LLMTurn(Frozen):
    """One model response: either a final message (content) or tool calls to dispatch.
    `assistant_message` is the raw OpenAI-shape message to thread back verbatim."""

    content: str | None
    tool_calls: tuple[ToolCall, ...]
    assistant_message: dict[str, Any]


class ReactResult(Frozen):
    final: str
    turns: int
    tool_calls_made: tuple[str, ...]  # tool names, in order — the audit trail
