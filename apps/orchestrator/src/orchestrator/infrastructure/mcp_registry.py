"""MCP tool registry — bridges an MCP server (our trading-mcp, over SSE) into the ReAct loop.
Loads the tool list once, maps MCP JSON-schemas → OpenAI tool specs, and dispatches call_tool.
Implements ToolRegistry. Because the MCP surface has no placement tool, the agent structurally
cannot trade — the propose/execute boundary is the toolset, not trust."""

from __future__ import annotations

from typing import Any

from mcp import ClientSession
from mcp.client.sse import sse_client
from mcp.types import TextContent


class McpToolRegistry:
    """Async-context-managed: `async with McpToolRegistry(url) as reg: ...`."""

    def __init__(self, url: str) -> None:
        self._url = url
        self._session: ClientSession | None = None
        self._schemas: list[dict[str, Any]] = []
        self._cm: Any = None
        self._sse: Any = None

    async def __aenter__(self) -> McpToolRegistry:
        self._sse = sse_client(self._url)
        read, write = await self._sse.__aenter__()
        self._cm = ClientSession(read, write)
        self._session = await self._cm.__aenter__()
        await self._session.initialize()
        listed = await self._session.list_tools()
        self._schemas = [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description or "",
                    "parameters": t.inputSchema or {"type": "object", "properties": {}},
                },
            }
            for t in listed.tools
        ]
        return self

    async def __aexit__(self, *exc: object) -> None:
        if self._cm is not None:
            await self._cm.__aexit__(*exc)
        if self._sse is not None:
            await self._sse.__aexit__(*exc)

    def schemas(self) -> list[dict[str, Any]]:
        return self._schemas

    async def dispatch(self, name: str, arguments: dict[str, Any]) -> str:
        if self._session is None:
            return "error: MCP session not open"
        try:
            result = await self._session.call_tool(name, arguments)
        except Exception as exc:  # noqa: BLE001 — tool errors returned as text for the model
            return f"error calling {name}: {exc}"
        parts = [c.text for c in result.content if isinstance(c, TextContent)]
        return "\n".join(parts) if parts else "(no output)"
