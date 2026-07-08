"""Strategy sweep — the running research harness. Runs a grid of (strategy, params) x symbol x
timeframe through our real walk-forward gate and reports what (if anything) passes. Bars fetched
once per (symbol, timeframe). Sharpe is annualized to each timeframe. Pure evaluation reused from
the intelligence core, so a sweep pass and a live decision agree by construction.

  GATEWAY_URL=http://localhost:3001 uv run python scripts/sweep.py

Honesty: sweeping configs and keeping the best is multiple-testing. A pass is only interesting if
it holds on a second symbol it wasn't selected on. Read the output with that in mind."""

from __future__ import annotations

import asyncio
import os
from collections.abc import Callable, Sequence
from functools import partial

from returns.pipeline import is_successful

from orchestrator.application.gate import evaluate
from orchestrator.application.signals import (
    bollinger_reversion,
    donchian_breakout,
    mean_reversion,
    momentum,
    sma_crossover,
    volume_momentum,
)
from orchestrator.application.walkforward import walk_forward
from orchestrator.domain.backtest import BacktestConfig, periods_per_year
from orchestrator.domain.gate import GateCriteria
from orchestrator.domain.strategy import Bar, Signal
from orchestrator.infrastructure.bars import lookback_start, url_symbol
from orchestrator.infrastructure.gateway import GatewayClient

SYMBOLS = ["BTC/USD", "ETH/USD", "LTC/USD", "SOL/USD"]
TIMEFRAMES = ["1Day", "1Hour"]
# Cycle-1 lesson (see docs/experiments.md): a short window manufactures false positives that
# evaporate on more data. Evaluate deep by default so a "pass" means something.
BARS = 1000

# (label, signal_fn) — a small, principled grid, not a mega-sweep. Cycle 2 adds signals beyond
# close price (channel breakout, volatility-scaled reversion, volume-confirmed momentum); the
# naive price-only families are kept as the refuted baseline.
CONFIGS: list[tuple[str, Callable[[Sequence[Bar]], Signal]]] = [
    ("sma_5_20", partial(sma_crossover, fast=5, slow=20)),
    ("sma_20_50", partial(sma_crossover, fast=20, slow=50)),
    ("momentum_20", partial(momentum, lookback=20)),
    ("meanrev_20", partial(mean_reversion, period=20)),
    # cycle 2 — beyond price
    ("donchian_20_10", partial(donchian_breakout, entry=20, exit_=10)),
    ("donchian_55_20", partial(donchian_breakout, entry=55, exit_=20)),
    ("bollinger_20_2", partial(bollinger_reversion, period=20, k=2.0)),
    ("bollinger_20_1", partial(bollinger_reversion, period=20, k=1.0)),
    ("volmom_20", partial(volume_momentum, lookback=20, vol_window=20, vol_mult=1.2)),
]


async def main() -> None:
    gateway = GatewayClient(
        base_url=os.environ.get("GATEWAY_URL", "http://localhost:3001"),
        api_key=os.environ.get("SERVICE_API_KEY", "dev-service-key"),
    )
    criteria = GateCriteria()
    rows: list[tuple[float, str, str, str, bool, float, float, float, int, float]] = []

    for symbol in SYMBOLS:
        for tf in TIMEFRAMES:
            # Annualize Sharpe to the bar timeframe — a 1Hour bar is not a day (cycle-2 fix).
            config = BacktestConfig(periods_per_year=periods_per_year(tf))
            fetched = await gateway.get_bars(
                url_symbol(symbol), tf, limit=min(1000, BARS * 2),
                start=lookback_start(tf, BARS),
            )
            if not is_successful(fetched):
                print(f"  skip {symbol}/{tf}: {fetched.failure().message}")
                continue
            bars = fetched.unwrap()[-BARS:]
            if len(bars) < 120:
                print(f"  skip {symbol}/{tf}: only {len(bars)} bars")
                continue
            for label, fn in CONFIGS:
                oos = walk_forward(label, symbol, bars, fn, config)
                v = evaluate(oos, criteria)
                rows.append(
                    (oos.oos_sharpe, label, symbol, tf, v.passed, oos.oos_return,
                     oos.oos_sharpe, oos.oos_max_drawdown, oos.oos_trades,
                     oos.positive_folds_frac)
                )

    rows.sort(reverse=True)
    print(f"\n  {'strategy':12} {'sym':8} {'tf':6} {'ret':>8} {'sharpe':>7} "
          f"{'dd':>6} {'trd':>4} {'pf':>4}  gate")
    print("  " + "-" * 66)
    passed = 0
    for _, label, sym, tf, ok, ret, sh, dd, trd, pf in rows:
        flag = "PASS" if ok else "block"
        if ok:
            passed += 1
        print(f"  {label:12} {sym:8} {tf:6} {ret*100:+7.1f}% {sh:7.2f} "
              f"{dd*100:5.1f}% {trd:4d} {pf*100:3.0f}%  {flag}")
    print(f"\n  {passed} / {len(rows)} configs passed the gate.")
    print(
        "  Multiple-testing caveat: with this many configs tried, treat any single pass as "
        "suspect until it holds on data it was not selected on."
    )


if __name__ == "__main__":
    asyncio.run(main())
