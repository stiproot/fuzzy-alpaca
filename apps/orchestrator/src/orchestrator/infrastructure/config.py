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
    )
