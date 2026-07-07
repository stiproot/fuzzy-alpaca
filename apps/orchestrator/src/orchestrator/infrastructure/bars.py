"""Bars cache — read-through over Postgres. Closed bars are immutable, so a cache hit needs no
freshness check; a miss (or a short series) fetches from the gateway and upserts. Result-typed."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from returns.pipeline import is_successful
from returns.result import Failure, Result, Success

from orchestrator.domain.strategy import Bar
from orchestrator.infrastructure.db import connect
from orchestrator.infrastructure.gateway import GatewayClient

# Rough seconds per timeframe unit, to compute a generous fetch start.
_UNIT_SECONDS = {"Min": 60, "Hour": 3600, "Day": 86400, "Week": 604800}


def _url_symbol(symbol: str) -> str:
    # Crypto pairs use the dash form in gateway URL paths (BTC/USD -> BTC-USD).
    return symbol.replace("/", "-")


def _lookback_start(timeframe: str, need: int) -> str:
    """A start timestamp comfortably older than `need` bars of `timeframe` (2x buffer)."""
    unit = next((u for u in _UNIT_SECONDS if timeframe.endswith(u)), "Day")
    n = int(timeframe[: -len(unit)] or 1)
    span = _UNIT_SECONDS[unit] * n * need * 2
    return (datetime.now(UTC) - timedelta(seconds=span)).strftime("%Y-%m-%dT%H:%M:%SZ")


class BarsCache:
    def __init__(self, dsn: str, gateway: GatewayClient) -> None:
        self._dsn = dsn
        self._gateway = gateway

    async def _select(self, symbol: str, timeframe: str, limit: int) -> list[Bar]:
        conn = await connect(self._dsn)
        try:
            rows = await conn.fetch(
                "SELECT ts, open, high, low, close, volume FROM bars "
                "WHERE symbol = $1 AND timeframe = $2 ORDER BY ts DESC LIMIT $3",
                symbol, timeframe, limit,
            )
        finally:
            await conn.close()
        # DESC for the limit, returned ascending for signal math
        return [Bar(**dict(r)) for r in reversed(rows)]

    async def _upsert(self, symbol: str, timeframe: str, bars: list[Bar]) -> None:
        conn = await connect(self._dsn)
        try:
            await conn.executemany(
                "INSERT INTO bars (symbol, timeframe, ts, open, high, low, close, volume) "
                "VALUES ($1,$2,$3,$4,$5,$6,$7,$8) "
                "ON CONFLICT (symbol, timeframe, ts) DO NOTHING",
                [
                    (symbol, timeframe, b.ts, b.open, b.high, b.low, b.close, b.volume)
                    for b in bars
                ],
            )
        finally:
            await conn.close()

    async def recent(
        self, symbol: str, timeframe: str, need: int
    ) -> Result[list[Bar], str]:
        """Return the most recent `need` bars (ascending), fetching+caching on a short series."""
        try:
            cached = await self._select(symbol, timeframe, need)
        except Exception as exc:  # noqa: BLE001 — DB edge, surfaced as Result
            return Failure(f"bars cache read: {exc}")
        if len(cached) >= need:
            return Success(cached)

        # Fetch a window wide enough to *contain* the recent `need` bars. The gateway returns
        # ascending from `start` up to `limit`, so request a generous limit and take the tail
        # (a bare limit from an old start would return the OLDEST bars, not the newest).
        start = _lookback_start(timeframe, need)
        wide = min(1000, max(need * 3, need + 10))
        fetched = await self._gateway.get_bars(
            _url_symbol(symbol), timeframe, limit=wide, start=start
        )
        if not is_successful(fetched):
            err = fetched.failure()
            return Failure(f"bars fetch {err.code}: {err.message}")
        try:
            await self._upsert(symbol, timeframe, fetched.unwrap())
            recent = await self._select(symbol, timeframe, need)  # most-recent `need`, ascending
        except Exception as exc:  # noqa: BLE001
            return Failure(f"bars cache write: {exc}")
        return Success(recent)
