"""Postgres access for analytics state — the bars cache and decisions journal (the KV/orders
mirror stays on Dapr state). A fresh connection per call keeps this compatible with the
asyncio.run-per-activity edge; correctness over pooling for the skeleton."""

from __future__ import annotations

import asyncpg

_SCHEMA = """
CREATE TABLE IF NOT EXISTS bars (
    symbol      text  NOT NULL,
    timeframe   text  NOT NULL,
    ts          text  NOT NULL,
    open        double precision NOT NULL,
    high        double precision NOT NULL,
    low         double precision NOT NULL,
    close       double precision NOT NULL,
    volume      double precision NOT NULL,
    PRIMARY KEY (symbol, timeframe, ts)
);

CREATE TABLE IF NOT EXISTS decisions (
    id          bigserial PRIMARY KEY,
    ts          timestamptz NOT NULL DEFAULT now(),
    strategy    text  NOT NULL,
    symbol      text  NOT NULL,
    action      text  NOT NULL,
    notional    text,
    rationale   text  NOT NULL,
    inputs      jsonb NOT NULL,
    order_id    text,
    outcome     text
);

CREATE TABLE IF NOT EXISTS backtests (
    id            bigserial PRIMARY KEY,
    ts            timestamptz NOT NULL DEFAULT now(),
    strategy      text   NOT NULL,
    symbol        text   NOT NULL,
    timeframe     text   NOT NULL,
    bars          int    NOT NULL,
    total_return  double precision NOT NULL,
    sharpe        double precision NOT NULL,
    max_drawdown  double precision NOT NULL,
    num_trades    int    NOT NULL,
    win_rate      double precision NOT NULL,
    config        jsonb  NOT NULL
);
"""


async def connect(dsn: str) -> asyncpg.Connection:
    return await asyncpg.connect(dsn)


async def init_schema(dsn: str) -> None:
    conn = await connect(dsn)
    try:
        await conn.execute(_SCHEMA)
    finally:
        await conn.close()
