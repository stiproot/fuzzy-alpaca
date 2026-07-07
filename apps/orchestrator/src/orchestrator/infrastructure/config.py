"""Configuration read once from the environment (frozen). The composition root builds adapters
from this; nothing else reads os.environ."""

from __future__ import annotations

import os
from functools import lru_cache

from pydantic import BaseModel, ConfigDict


class Settings(BaseModel):
    model_config = ConfigDict(frozen=True)

    gateway_url: str
    service_api_key: str
    dapr_http_port: str
    database_url: str
    state_store: str = "statestore"
    # research agent
    mcp_url: str = "http://localhost:8090/sse"
    llm_base_url: str = "https://api.deepseek.com/v1"
    llm_api_key: str = ""
    llm_model: str = "deepseek-chat"
    research_symbols: str = "BTC/USD,ETH/USD"

    @property
    def state_url(self) -> str:
        return f"http://localhost:{self.dapr_http_port}/v1.0/state/{self.state_store}"


@lru_cache(maxsize=1)
def load_settings() -> Settings:
    return Settings(
        gateway_url=os.environ.get("GATEWAY_URL", "http://localhost:3000"),
        service_api_key=os.environ["SERVICE_API_KEY"],
        dapr_http_port=os.environ.get("DAPR_HTTP_PORT", "3500"),
        database_url=os.environ.get(
            "DATABASE_URL", "postgresql://alpaca:alpaca@localhost:5432/alpaca"
        ),
        state_store=os.environ.get("STATE_STORE", "statestore"),
        mcp_url=os.environ.get("MCP_URL", "http://localhost:8090/sse"),
        llm_base_url=os.environ.get("LLM_BASE_URL", "https://api.deepseek.com/v1"),
        llm_api_key=os.environ.get("LLM_API_KEY", ""),
        llm_model=os.environ.get("LLM_MODEL", "deepseek-chat"),
        research_symbols=os.environ.get("RESEARCH_SYMBOLS", "BTC/USD,ETH/USD"),
    )
