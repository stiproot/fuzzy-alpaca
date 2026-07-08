"""Regime-overlay backtest — cycle-6 experiment (docs/experiments/006-vix-regime-overlay.md).
Experiment 5 left the 57-name bollinger basket at OOS Sharpe 0.43 — every gate criterion clear
except Sharpe. This tests whether a PRE-REGISTERED macro risk-regime overlay (flat when risk-off)
closes the gap. Exactly two variants, thresholds fixed a priori — no threshold sweeps:

  V1 vix_ts : risk-on iff VIX3M/VIX close ratio > 1.0 (contango), previous day's closes
  V2 hy_oas : risk-off iff FRED HY-OAS 120-obs causal z-score > +1.0, previous day's value

Controls on identical data: the baseline basket (must reproduce Exp 5's 0.43) and SPY buy-and-hold
through the same walk-forward machinery (the beta control). Decision rule (pre-registered): a
variant is a candidate pass only if it (i) passes the full gate, (ii) beats the baseline basket's
Sharpe, and (iii) beats the SPY buy-and-hold control's Sharpe — then must directionally improve
the meanrev_20 basket too (regime info should be strategy-agnostic).

  GATEWAY_URL=http://localhost:3001 uv run python scripts/overlay.py
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import Sequence
from functools import partial

from returns.pipeline import is_successful

from orchestrator.application.gate import evaluate
from orchestrator.application.regime import (
    RegimeSeries,
    ratio_regime,
    regime_filtered,
    zscore_regime,
)
from orchestrator.application.signals import bollinger_reversion, mean_reversion
from orchestrator.application.walkforward import portfolio_walk_forward, walk_forward
from orchestrator.domain.backtest import BacktestConfig, WalkForwardResult, periods_per_year
from orchestrator.domain.gate import GateCriteria
from orchestrator.domain.strategy import Bar, Signal
from orchestrator.infrastructure.bars import lookback_start, url_symbol
from orchestrator.infrastructure.gateway import GatewayClient
from orchestrator.infrastructure.macro import fetch_cboe_closes, fetch_fred_series

# Identical universe/window to Experiment 5 (one variable at a time: only the overlay changes).
BASKET = [
    "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "ORCL", "CRM", "ADBE",
    "CSCO", "INTC", "AMD", "QCOM", "TXN", "IBM", "NFLX", "DIS", "CMCSA", "INTU",
    "JPM", "BAC", "WFC", "GS", "MS", "AXP", "C", "V", "MA",
    "JNJ", "UNH", "PFE", "MRK", "ABBV", "TMO", "ABT", "LLY", "AMGN",
    "WMT", "HD", "PG", "KO", "PEP", "MCD", "NKE", "SBUX", "LOW", "COST", "TGT",
    "XOM", "CVX", "CAT", "BA", "HON", "GE", "UPS",
    "SPY", "QQQ",
]
TIMEFRAME = "1Day"
BARS = 1000
TRIALS = 2  # pre-registered variant count — the multiple-testing denominator this cycle


def buy_and_hold(_bars: Sequence[Bar]) -> Signal:
    """Beta control: enter at the first tradable bar, never exit (same fees/folds as the basket)."""
    return Signal(action="buy", strength=1.0, reason="buy-and-hold control")


def _fmt(r: WalkForwardResult, passed: bool) -> str:
    flag = "PASS" if passed else "block"
    return (
        f"ret{r.oos_return * 100:+7.1f}%  sh{r.oos_sharpe:+.2f}  dd{r.oos_max_drawdown * 100:5.1f}%"
        f"  folds+{r.positive_folds}/{r.folds}  trades{r.oos_trades:>5}  {flag}"
    )


async def main() -> None:
    gateway = GatewayClient(
        base_url=os.environ.get("GATEWAY_URL", "http://localhost:3001"),
        api_key=os.environ.get("SERVICE_API_KEY", "dev-service-key"),
    )
    config = BacktestConfig(periods_per_year=periods_per_year(TIMEFRAME, "equity"))
    criteria = GateCriteria()

    # Macro series for the two pre-registered regimes.
    vix = await fetch_cboe_closes("VIX")
    vix3m = await fetch_cboe_closes("VIX3M")
    hy = await fetch_fred_series("BAMLH0A0HYM2", start="2021-01-01")
    for name, res in (("VIX", vix), ("VIX3M", vix3m), ("HY-OAS", hy)):
        if not is_successful(res):
            print(f"  macro fetch failed ({name}): {res.failure()}")
            return
    regimes: dict[str, RegimeSeries] = {
        "vix_ts": ratio_regime(vix3m.unwrap(), vix.unwrap(), threshold=1.0),
        "hy_oas": zscore_regime(hy.unwrap(), window=120, threshold=1.0),
    }

    # Basket bars, aligned to a common calendar (same as Experiment 5).
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
    sample = aligned[next(iter(aligned))]
    window = f"{sample[0].ts[:10]} → {sample[-1].ts[:10]}"
    print(f"\n  Basket: {len(aligned)} names, {common} aligned {TIMEFRAME} bars each ({window}).")
    for name, regime in regimes.items():
        print(f"  Regime {name}: risk-off {regime.risk_off_frac * 100:.0f}% of macro observations.")
    print(f"  Pre-registered trials this cycle: N={TRIALS} (see experiment 006 decision rule).\n")

    # Controls.
    spy = walk_forward("spy_hold", "SPY", aligned["SPY"], buy_and_hold, config)
    print(f"  {'control: SPY buy-and-hold':34} {_fmt(spy, evaluate(spy, criteria).passed)}")

    results: dict[str, dict[str, WalkForwardResult]] = {}
    for strat_label, fn in (
        ("bollinger_20_2", partial(bollinger_reversion, period=20, k=2.0)),
        ("meanrev_20", partial(mean_reversion, period=20)),
    ):
        results[strat_label] = {}
        for variant, signal_fn in (
            ("baseline", fn),
            *((v, regime_filtered(fn, regime)) for v, regime in regimes.items()),
        ):
            pf = portfolio_walk_forward(f"{strat_label}.{variant}", aligned, signal_fn, config)
            results[strat_label][variant] = pf
            v = evaluate(pf, criteria)
            print(f"  {strat_label + ' · ' + variant:34} {_fmt(pf, v.passed)}")
            if not v.passed:
                print(f"       └─ blocks: {'; '.join(v.reasons)}")
        print()

    # Pre-registered decision rule.
    base = results["bollinger_20_2"]["baseline"]
    print("  Decision rule (gate pass AND > baseline AND > SPY control; then meanrev confirms):")
    for variant in regimes:
        pf = results["bollinger_20_2"][variant]
        gate_ok = evaluate(pf, criteria).passed
        beats_base = pf.oos_sharpe > base.oos_sharpe
        beats_spy = pf.oos_sharpe > spy.oos_sharpe
        confirms = (
            results["meanrev_20"][variant].oos_sharpe
            > results["meanrev_20"]["baseline"].oos_sharpe
        )
        verdict = (
            "CANDIDATE PASS" if (gate_ok and beats_base and beats_spy and confirms)
            else "refuted"
        )
        print(
            f"    {variant:8} gate={'y' if gate_ok else 'n'} >base={'y' if beats_base else 'n'} "
            f">spy={'y' if beats_spy else 'n'} meanrev-confirm={'y' if confirms else 'n'}"
            f"  → {verdict}"
        )
    print(
        "\n  N=2 pre-registered variants; thresholds fixed a priori. If neither clears, the cycle"
        "\n  conclusion is 'refuted' — no third macro series gets tried (experiment 006)."
    )


if __name__ == "__main__":
    asyncio.run(main())
