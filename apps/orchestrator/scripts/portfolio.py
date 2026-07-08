"""Portfolio backtest — cycle-5 experiment. Experiment 4 found bollinger mean-reversion is a
broad, weak, positive edge on large-cap equities (positive on 15/18 names, but only MSFT clears the
gate alone). This tests the diversification thesis: gate an equal-weight, daily-rebalanced BASKET of
one strategy across the whole universe, not any single ticker.

  GATEWAY_URL=http://localhost:3001 uv run python scripts/portfolio.py

For each strategy it prints the single-name OOS Sharpe distribution (breadth) next to the basket's
OOS gate verdict, so the diversification lift is legible. A basket pass is robust by construction —
it is the average of many names, not a right-tail single ticker."""

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
)
from orchestrator.application.sizing import Sizer, full_size, vol_target_sizer
from orchestrator.application.walkforward import portfolio_walk_forward, walk_forward
from orchestrator.domain.backtest import BacktestConfig, periods_per_year
from orchestrator.domain.gate import GateCriteria
from orchestrator.domain.strategy import Bar, Signal
from orchestrator.infrastructure.bars import lookback_start, url_symbol
from orchestrator.infrastructure.gateway import GatewayClient

# Broad liquid large-cap basket across sectors (all with multi-year daily history). Equal-weight,
# shared NYSE calendar → index-aligned. Breadth is the point: if bollinger mean-reversion is a real
# edge, the basket Sharpe should rise with N as idiosyncratic noise diversifies away.
BASKET = [
    # tech / comms
    "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "ORCL", "CRM", "ADBE",
    "CSCO", "INTC", "AMD", "QCOM", "TXN", "IBM", "NFLX", "DIS", "CMCSA", "INTU",
    # financials
    "JPM", "BAC", "WFC", "GS", "MS", "AXP", "C", "V", "MA",
    # health care
    "JNJ", "UNH", "PFE", "MRK", "ABBV", "TMO", "ABT", "LLY", "AMGN",
    # consumer / staples
    "WMT", "HD", "PG", "KO", "PEP", "MCD", "NKE", "SBUX", "LOW", "COST", "TGT",
    # industrial / energy
    "XOM", "CVX", "CAT", "BA", "HON", "GE", "UPS",
    # broad ETFs
    "SPY", "QQQ",
]
TIMEFRAME = "1Day"
BARS = 1000

# (label, signal_fn, sleeve_target_vol) — target_vol None = equal-weight sleeves; a value applies a
# per-sleeve volatility-target sizer, which risk-normalizes the sleeves (risk parity): low-vol names
# scale up, noisy high-vol names scale down, so no single name dominates the basket's risk.
CONFIGS: list[tuple[str, Callable[[Sequence[Bar]], Signal], float | None]] = [
    ("bollinger_20_2", partial(bollinger_reversion, period=20, k=2.0), None),
    ("bollinger_20_2.rp15", partial(bollinger_reversion, period=20, k=2.0), 0.15),
    ("bollinger_20_2.rp10", partial(bollinger_reversion, period=20, k=2.0), 0.10),
    ("meanrev_20", partial(mean_reversion, period=20), None),
    ("momentum_20", partial(momentum, lookback=20), None),
    ("donchian_20_10", partial(donchian_breakout, entry=20, exit_=10), None),
    ("sma_20_50", partial(sma_crossover, fast=20, slow=50), None),
]


async def main() -> None:
    gateway = GatewayClient(
        base_url=os.environ.get("GATEWAY_URL", "http://localhost:3001"),
        api_key=os.environ.get("SERVICE_API_KEY", "dev-service-key"),
    )
    config = BacktestConfig(periods_per_year=periods_per_year(TIMEFRAME, "equity"))
    criteria = GateCriteria()

    # Fetch the basket once, align to a common length (same trading calendar).
    symbol_bars: dict[str, list[Bar]] = {}
    for sym in BASKET:
        fetched = await gateway.get_bars(
            url_symbol(sym), TIMEFRAME, limit=min(1000, BARS * 2),
            start=lookback_start(TIMEFRAME, BARS),
        )
        if not is_successful(fetched):
            print(f"  skip {sym}: {fetched.failure().message}")
            continue
        symbol_bars[sym] = fetched.unwrap()[-BARS:]
    if not symbol_bars:
        print("  no bars fetched — is the gateway up?")
        return
    common = min(len(b) for b in symbol_bars.values())
    aligned = {s: b[-common:] for s, b in symbol_bars.items()}
    print(f"\n  Basket: {len(aligned)} names, {common} aligned {TIMEFRAME} bars each.\n")

    print(f"  {'strategy':16} {'names+':>7} {'single-Sharpe':>26}   {'basket':>34}")
    print("  " + "-" * 92)
    for label, fn, target_vol in CONFIGS:
        sizer: Sizer = (
            full_size if target_vol is None
            else vol_target_sizer(target_vol, 20, config.periods_per_year)
        )
        # single-name Sharpe distribution (breadth) — the diversification input
        singles = []
        for sym, bars in aligned.items():
            oos = walk_forward(label, sym, bars, fn, config, sizer=sizer)
            singles.append(oos.oos_sharpe)
        pos = sum(1 for s in singles if s > 0)
        mean_s = sum(singles) / len(singles)
        best = max(singles)

        # the basket — gate THIS
        pf = portfolio_walk_forward(label, aligned, fn, config, sizer=sizer)
        v = evaluate(pf, criteria)
        flag = "PASS" if v.passed else "block"
        dist = f"+{pos}/{len(singles)} mean{mean_s:+.2f} best{best:+.2f}"
        basket = (
            f"ret{pf.oos_return * 100:+6.1f}% sh{pf.oos_sharpe:+.2f} "
            f"dd{pf.oos_max_drawdown * 100:4.1f}% pf{pf.positive_folds_frac * 100:3.0f}% {flag}"
        )
        print(f"  {label:16} {pos:>3}/{len(singles):<3} {dist:>26}   {basket:>34}")
        if not v.passed:
            print(f"       └─ blocks: {'; '.join(v.reasons)}")

    print(
        "\n  Basket = equal-weight, daily-rebalanced, one strategy across all names. A basket pass "
        "is\n  robust by construction (an average of many names, not a single-ticker right tail)."
    )


if __name__ == "__main__":
    asyncio.run(main())
