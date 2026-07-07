"""Composition root — runs the HTTP host that owns the Dapr Workflow worker."""

from __future__ import annotations

import os

import uvicorn


def run() -> None:
    uvicorn.run(
        "orchestrator.presentation.app:app",
        host="0.0.0.0",  # noqa: S104 — container service, bound by the network boundary
        port=int(os.environ.get("APP_PORT", "8080")),
    )


if __name__ == "__main__":
    run()
