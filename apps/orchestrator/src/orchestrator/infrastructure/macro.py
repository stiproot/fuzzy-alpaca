"""Macro series adapters — CBOE daily index history CSVs and FRED series, mapped into ascending
(date, close) pairs for the regime layer. Result-typed; no exception escapes into the pure core."""

from __future__ import annotations

import httpx
from returns.result import Failure, Result, Success

from orchestrator.application.regime import DatedValue

_CBOE_URL = "https://cdn.cboe.com/api/global/us_indices/daily_prices/{index}_History.csv"
_FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}&cosd={start}"
_TIMEOUT = 30.0


async def _fetch_csv(url: str) -> Result[list[list[str]], str]:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
    except httpx.HTTPError as exc:
        return Failure(f"GET {url}: {exc}")
    lines = [ln.strip() for ln in resp.text.splitlines() if ln.strip()]
    return Success([ln.split(",") for ln in lines[1:]])  # drop header


def _mdy_to_iso(mdy: str) -> str:
    m, d, y = mdy.split("/")
    return f"{y}-{m.zfill(2)}-{d.zfill(2)}"


async def fetch_cboe_closes(index: str) -> Result[list[DatedValue], str]:
    """Daily closes for a CBOE index (e.g. VIX, VIX3M). Rows: DATE,OPEN,HIGH,LOW,CLOSE with
    MM/DD/YYYY dates."""

    def parse(rows: list[list[str]]) -> list[DatedValue]:
        return sorted((_mdy_to_iso(r[0]), float(r[4])) for r in rows if len(r) >= 5)

    return (await _fetch_csv(_CBOE_URL.format(index=index))).map(parse)


async def fetch_fred_series(series_id: str, start: str) -> Result[list[DatedValue], str]:
    """Daily observations for a FRED series from `start` (YYYY-MM-DD). Rows:
    observation_date,VALUE with '.' for missing observations (skipped)."""

    def parse(rows: list[list[str]]) -> list[DatedValue]:
        return sorted((r[0], float(r[1])) for r in rows if len(r) >= 2 and r[1] not in ("", "."))

    return (await _fetch_csv(_FRED_URL.format(series=series_id, start=start))).map(parse)
