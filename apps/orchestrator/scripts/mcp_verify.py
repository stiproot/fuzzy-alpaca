"""Drive the trading-mcp as an agent would: connect over SSE, list the tools, then run the honest
research loop — market_snapshot → backtest → evaluate_gate — and confirm no placement tool exists.

  uv run python scripts/mcp_verify.py   (expects the server at MCP_URL or localhost:8090)"""

from __future__ import annotations

import asyncio
import json
import os

from mcp.client.session import ClientSession
from mcp.client.sse import sse_client


def _text(result: object) -> str:
    content = getattr(result, "content", [])
    return content[0].text if content else "{}"


async def main() -> None:
    url = os.environ.get("MCP_URL", "http://localhost:8090/sse")
    async with sse_client(url) as (read, write), ClientSession(read, write) as session:
        await session.initialize()

        tools = await session.list_tools()
        names = [t.name for t in tools.tools]
        print(f"tools: {names}")
        assert not any("place" in n or "order" in n for n in names), "placement tool leaked!"

        snap = _text(await session.call_tool("market_snapshot", {"symbol": "BTC/USD"}))
        latest = json.loads(snap).get("latestTrade", {})
        print(f"snapshot BTC/USD latest trade price: {latest.get('price')}")

        bt = json.loads(_text(await session.call_tool("backtest", {
            "strategy": "sma_crossover", "symbol": "BTC/USD",
        })))
        print(
            f"backtest sma_crossover: return={bt.get('total_return'):.3f} "
            f"sharpe={bt.get('sharpe'):.2f}"
        )

        gate = json.loads(_text(await session.call_tool("evaluate_gate", {
            "strategy": "sma_crossover", "symbol": "BTC/USD",
        })))
        print(f"gate sma_crossover: passed={gate.get('passed')} reasons={gate.get('reasons')}")

        print("MCP VERIFY OK")


if __name__ == "__main__":
    asyncio.run(main())
