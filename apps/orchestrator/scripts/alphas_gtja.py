"""GTJA-survivor cross-sectional backtest — cycle-7 experiment
(docs/experiments/007-gtja-survivors-us.md). Tests vibe-trading's five claimed-surviving GTJA-191
alphas on OUR universe: ranked daily across the 57-name basket, long top quintile, real costs.
Pre-registered: 5 alphas × {raw, smooth20} = N=10 trials, decision at 10 bps/side (5/20 bps are
sensitivity only). Controls: SPY buy-and-hold and hold-all (top_frac=1.0). A candidate pass must
clear the gate AND both controls, then confirm with positive OOS Sharpe on a disjoint 30-name
basket. Zero passes ⇒ claim refuted for our universe; we do NOT mine the other 186 alphas.

  GATEWAY_URL=http://localhost:3001 uv run python scripts/alphas_gtja.py
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import Sequence

from returns.pipeline import is_successful

from orchestrator.application.alphas import GTJA_SURVIVORS, AlphaSeries
from orchestrator.application.cross_sectional import cross_sectional_walk_forward
from orchestrator.application.gate import evaluate
from orchestrator.application.walkforward import walk_forward
from orchestrator.domain.backtest import BacktestConfig, WalkForwardResult, periods_per_year
from orchestrator.domain.gate import GateCriteria
from orchestrator.domain.strategy import Bar, Signal
from orchestrator.infrastructure.bars import lookback_start, url_symbol
from orchestrator.infrastructure.gateway import GatewayClient

BASKET = [
    "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "ORCL", "CRM", "ADBE",
    "CSCO", "INTC", "AMD", "QCOM", "TXN", "IBM", "NFLX", "DIS", "CMCSA", "INTU",
    "JPM", "BAC", "WFC", "GS", "MS", "AXP", "C", "V", "MA",
    "JNJ", "UNH", "PFE", "MRK", "ABBV", "TMO", "ABT", "LLY", "AMGN",
    "WMT", "HD", "PG", "KO", "PEP", "MCD", "NKE", "SBUX", "LOW", "COST", "TGT",
    "XOM", "CVX", "CAT", "BA", "HON", "GE", "UPS",
    "SPY", "QQQ",
]
# Confirmation universe — zero overlap with BASKET (pre-registered in experiment 007).
ALT_BASKET = [
    "AVGO", "TSLA", "LIN", "ACN", "TMUS", "VZ", "T", "PM", "MO", "BMY",
    "GILD", "ISRG", "MDT", "SYK", "DE", "LMT", "RTX", "NOC", "FDX", "ADP",
    "MMC", "BLK", "SCHW", "USB", "PNC", "COP", "SLB", "EOG", "NEE", "DUK",
]
TIMEFRAME = "1Day"
BARS = 1000
WARMUP = 45  # max alpha lookback (~21) + smooth20, identical for all variants
COSTS = (0.0005, 0.0010, 0.0020)  # per side; 10 bps is the pre-registered decision cost
DECISION_COST = 0.0010
TRIALS = 10  # 5 alphas × {raw, smooth20}


def buy_and_hold(_bars: Sequence[Bar]) -> Signal:
    return Signal(action="buy", strength=1.0, reason="buy-and-hold control")


def hold_all_alpha(bars: Sequence[Bar]) -> list[float | None]:
    return [0.0] * len(bars)


def _fmt(r: WalkForwardResult, passed: bool) -> str:
    flag = "PASS" if passed else "block"
    return (
        f"ret{r.oos_return * 100:+7.1f}%  sh{r.oos_sharpe:+.2f}  dd{r.oos_max_drawdown * 100:5.1f}%"
        f"  folds+{r.positive_folds}/{r.folds}  trades{r.oos_trades:>5}  {flag}"
    )


async def _fetch_aligned(
    gateway: GatewayClient, symbols: Sequence[str]
) -> dict[str, list[Bar]]:
    symbol_bars: dict[str, list[Bar]] = {}
    for sym in symbols:
        fetched = await gateway.get_bars(
            url_symbol(sym), TIMEFRAME, limit=min(1000, BARS * 2),
            start=lookback_start(TIMEFRAME, BARS),
        )
        if not is_successful(fetched):
            print(f"  skip {sym}: {fetched.failure().message}")
            continue
        symbol_bars[sym] = fetched.unwrap()[-BARS:]
    if not symbol_bars:
        return {}
    common = min(len(b) for b in symbol_bars.values())
    return {s: b[-common:] for s, b in symbol_bars.items()}


async def main() -> None:
    gateway = GatewayClient(
        base_url=os.environ.get("GATEWAY_URL", "http://localhost:3001"),
        api_key=os.environ.get("SERVICE_API_KEY", "dev-service-key"),
    )
    config = BacktestConfig(warmup=WARMUP, periods_per_year=periods_per_year(TIMEFRAME, "equity"))
    criteria = GateCriteria()

    aligned = await _fetch_aligned(gateway, BASKET)
    if not aligned:
        print("  no bars fetched — is the gateway up?")
        return
    sample = aligned[next(iter(aligned))]
    print(
        f"\n  Universe: {len(aligned)} names, {len(sample)} aligned {TIMEFRAME} bars "
        f"({sample[0].ts[:10]} → {sample[-1].ts[:10]}). Pre-registered trials: N={TRIALS}; "
        f"decision cost {DECISION_COST * 1e4:.0f} bps/side.\n"
    )

    spy = walk_forward("spy_hold", "SPY", aligned["SPY"], buy_and_hold, config)
    print(f"  {'control: SPY buy-and-hold':30} {_fmt(spy, evaluate(spy, criteria).passed)}")
    hold_all = cross_sectional_walk_forward(
        "hold_all", aligned, hold_all_alpha, config,
        top_frac=1.0, cost_per_side=DECISION_COST,
    )
    print(f"  {'control: hold-all 57 @10bps':30} "
          f"{_fmt(hold_all, evaluate(hold_all, criteria).passed)}\n")

    candidates: list[tuple[str, AlphaSeries, int]] = []
    for alpha_name, fn in GTJA_SURVIVORS.items():
        for smooth, tag in ((1, "raw"), (20, "smooth20")):
            label = f"{alpha_name}.{tag}"
            decision: WalkForwardResult | None = None
            for cost in COSTS:
                r = cross_sectional_walk_forward(
                    label, aligned, fn, config,
                    top_frac=0.2, cost_per_side=cost, smooth=smooth,
                )
                marker = "*" if cost == DECISION_COST else " "
                print(f" {marker}{label:26}@{cost * 1e4:2.0f}bp "
                      f"{_fmt(r, evaluate(r, criteria).passed)}")
                if cost == DECISION_COST:
                    decision = r
            assert decision is not None
            gate_ok = evaluate(decision, criteria).passed
            beats = (
                decision.oos_sharpe > spy.oos_sharpe
                and decision.oos_sharpe > hold_all.oos_sharpe
            )
            if gate_ok and beats:
                candidates.append((label, fn, smooth))
            print()

    if not candidates:
        print(
            "  Decision: 0 candidate passes out of N=10 trials at 10 bps — the vibe-trading\n"
            "  GTJA-survivor claim is refuted for our universe. Per pre-registration, the other\n"
            "  186 GTJA alphas will NOT be mined for a passing one."
        )
        return

    print(f"  Candidate passes: {[c[0] for c in candidates]} — confirming on disjoint "
          f"{len(ALT_BASKET)}-name basket…")
    alt = await _fetch_aligned(gateway, ALT_BASKET)
    for label, fn, smooth in candidates:
        r = cross_sectional_walk_forward(
            f"{label}.alt", alt, fn, config,
            top_frac=0.2, cost_per_side=DECISION_COST, smooth=smooth,
        )
        confirmed = r.oos_sharpe > 0
        print(f"  confirm {label:26} {_fmt(r, evaluate(r, criteria).passed)} "
              f"→ {'CONFIRMED (hypothesis, not edge)' if confirmed else 'FAILED confirmation'}")


if __name__ == "__main__":
    asyncio.run(main())
