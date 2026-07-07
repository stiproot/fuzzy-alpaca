"""Ports for the agent loop — the hexagonal boundary. The DeepSeek adapter and the MCP tool
registry implement these; the loop depends only on the Protocols."""

from __future__ import annotations

from typing import Any, Protocol

from returns.result import Result

from orchestrator.domain.agent import LLMTurn


class LLMClient(Protocol):
    async def generate(
        self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]
    ) -> Result[LLMTurn, str]: ...


class ToolRegistry(Protocol):
    def schemas(self) -> list[dict[str, Any]]:
        """OpenAI tool specs for the tools this registry exposes."""
        ...

    async def dispatch(self, name: str, arguments: dict[str, Any]) -> str:
        """Run a tool and return its output as text (errors returned as text, not raised)."""
        ...
