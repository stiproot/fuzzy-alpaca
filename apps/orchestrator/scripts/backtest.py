"""Backtest a strategy over real gateway bars and (optionally) persist the result.

  uv run python scripts/backtest.py --strategy mean_reversion --symbol BTC/USD --bars 200

Reads GATEWAY_URL, SERVICE_API_KEY, DATABASE_URL from the environment (see the compose stack)."""

from __future__ import annotations

import argparse
import asyncio
import os

from returns.pipeline import is_successful

from orchestrator.application.backtest import run_backtest
from orchestrator.application.signals import STRATEGIES
from orchestrator.domain.backtest import BacktestConfig
from orchestrator.infrastructure.backtests_repo import BacktestsRepo
from orchestrator.infrastructure.bars import lookback_start, url_symbol
from orchestrator.infrastructure.db import init_schema
from orchestrator.infrastructure.gateway import GatewayClient


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--strategy", required=True, choices=sorted(STRATEGIES))
    ap.add_argument("--symbol", default="BTC/USD")
    ap.add_argument("--timeframe", default="1Day")
    ap.add_argument("--bars", type=int, default=200)
    ap.add_argument("--no-persist", action="store_true")
    args = ap.parse_args()

    gateway = GatewayClient(
        base_url=os.environ.get("GATEWAY_URL", "http://localhost:3001"),
        api_key=os.environ.get("SERVICE_API_KEY", "dev-service-key"),
    )
    # Fetch a wide window from a lookback start, then take the most-recent `bars` (a bare limit
    # from an old start returns the oldest bars).
    start = lookback_start(args.timeframe, args.bars)
    fetched = await gateway.get_bars(
        url_symbol(args.symbol), args.timeframe, limit=min(1000, args.bars * 2), start=start
    )
    if not is_successful(fetched):
        err = fetched.failure()
        raise SystemExit(f"bars fetch failed: {err.code} {err.message}")
    bars = fetched.unwrap()[-args.bars :]

    config = BacktestConfig()
    result = run_backtest(
        args.strategy, args.symbol, bars, STRATEGIES[args.strategy], config
    )

    print(f"\n  {args.strategy}  {args.symbol}  {args.timeframe}  ({result.bars} bars)")
    print("  " + "-" * 40)
    print(f"  total return   {result.total_return * 100:+7.2f}%")
    print(f"  sharpe (ann.)  {result.sharpe:7.2f}")
    print(f"  max drawdown   {result.max_drawdown * 100:7.2f}%")
    print(f"  trades         {result.num_trades:7d}")
    print(f"  win rate       {result.win_rate * 100:7.1f}%")
    print(f"  final equity   ${result.final_equity:,.2f}\n")

    if not args.no_persist:
        dsn = os.environ.get("DATABASE_URL", "postgresql://alpaca:alpaca@localhost:5433/alpaca")
        await init_schema(dsn)
        saved = await BacktestsRepo(dsn).record(result, args.timeframe, config)
        if is_successful(saved):
            print(f"  saved backtest #{saved.unwrap()}")
        else:
            print(f"  persist failed: {saved.failure()}")


if __name__ == "__main__":
    asyncio.run(main())
