"""research-agent — the cron-driven research loop host. A Dapr `bindings.cron` component POSTs to
`/research-tick`; each tick runs one ReAct research pass over the MCP tools and records a proposal.
A lock makes overlapping ticks no-op (h's pattern). Also exposes a manual trigger and a healthz.

Composition root: `python -m orchestrator.presentation.agent_app`."""

from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import uvicorn
from fastapi import FastAPI
from returns.pipeline import is_successful

from orchestrator.application.research import research_tick
from orchestrator.infrastructure.config import load_settings
from orchestrator.infrastructure.db import init_schema
from orchestrator.infrastructure.deepseek import DeepSeekClient
from orchestrator.infrastructure.mcp_registry import McpToolRegistry
from orchestrator.infrastructure.proposals import ProposalsRepo

_tick_lock = asyncio.Lock()


@asynccontextmanager
async def _lifespan(_app: FastAPI) -> AsyncIterator[None]:
    await init_schema(load_settings().database_url)
    yield


app = FastAPI(title="fuzzy-alpaca research-agent", lifespan=_lifespan)


async def _run_once() -> dict[str, Any]:
    s = load_settings()
    if not s.llm_api_key:
        return {"skipped": "LLM_API_KEY not set"}
    llm = DeepSeekClient(base_url=s.llm_base_url, api_key=s.llm_api_key, model=s.llm_model)
    symbols = [x.strip() for x in s.research_symbols.split(",") if x.strip()]
    async with McpToolRegistry(s.mcp_url) as tools:
        result = await research_tick(llm, tools, symbols)
    saved = await ProposalsRepo(s.database_url).record(s.llm_model, result)
    return {
        "turns": result.turns,
        "tool_calls": list(result.tool_calls_made),
        "proposal": result.final,
        "proposal_id": saved.unwrap() if is_successful(saved) else None,
        "persist_error": None if is_successful(saved) else saved.failure(),
    }


async def _tick() -> dict[str, Any]:
    if _tick_lock.locked():
        return {"skipped": "previous tick still running"}
    async with _tick_lock:
        return await _run_once()


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/research-tick")
async def research_tick_route() -> dict[str, Any]:
    """Dapr cron binding target (named after the `cron-tick` component)."""
    return await _tick()


@app.post("/run")
async def run_now() -> dict[str, Any]:
    """Manual, on-demand trigger."""
    return await _tick()


def run() -> None:
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("APP_PORT", "8080")))  # noqa: S104


if __name__ == "__main__":
    run()
