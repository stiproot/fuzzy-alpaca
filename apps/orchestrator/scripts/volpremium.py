"""Vol-risk-premium sleeve — cycle-8 experiment (docs/experiments/008-vol-risk-premium.md).
Long SVXY only while VIX3M/VIX > 1.0 (contango), flat otherwise — the timing signal from cycle 6,
pointed at the strategy family it is economically coherent for. Pre-registered N=3 trials (full /
vt25 / vt10 sizings); controls: unfiltered SVXY buy-and-hold (the null) and SPY buy-and-hold
(context). Decision: gate pass AND Sharpe+maxDD both better than unfiltered SVXY. Confirmation on
SVIX (−1x cousin). Pure composition of existing machinery — no new engine code.

  GATEWAY_URL=http://localhost:3001 uv run python scripts/volpremium.py
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import Sequence

from returns.pipeline import is_successful

from orchestrator.application.gate import evaluate
from orchestrator.application.regime import RegimeSeries, ratio_regime, regime_filtered
from orchestrator.application.sizing import Sizer, full_size, vol_target_sizer
from orchestrator.application.walkforward import walk_forward
from orchestrator.domain.backtest import BacktestConfig, WalkForwardResult, periods_per_year
from orchestrator.domain.gate import GateCriteria
from orchestrator.domain.strategy import Bar, Signal
from orchestrator.infrastructure.bars import lookback_start, url_symbol
from orchestrator.infrastructure.gateway import GatewayClient
from orchestrator.infrastructure.macro import fetch_cboe_closes

TIMEFRAME = "1Day"
BARS = 1000
TRIALS = 3  # full / vt25 / vt10 — the only trials this cycle


def buy_and_hold(_bars: Sequence[Bar]) -> Signal:
    return Signal(action="buy", strength=1.0, reason="hold the premium")


def _fmt(r: WalkForwardResult, passed: bool) -> str:
    flag = "PASS" if passed else "block"
    return (
        f"ret{r.oos_return * 100:+7.1f}%  sh{r.oos_sharpe:+.2f}  dd{r.oos_max_drawdown * 100:5.1f}%"
        f"  folds+{r.positive_folds}/{r.folds}  trades{r.oos_trades:>3}  {flag}"
    )


async def _fetch(gateway: GatewayClient, sym: str) -> list[Bar] | None:
    fetched = await gateway.get_bars(
        url_symbol(sym), TIMEFRAME, limit=min(1000, BARS * 2),
        start=lookback_start(TIMEFRAME, BARS),
    )
    if not is_successful(fetched):
        print(f"  fetch {sym} failed: {fetched.failure().message}")
        return None
    return fetched.unwrap()[-BARS:]


async def main() -> None:
    gateway = GatewayClient(
        base_url=os.environ.get("GATEWAY_URL", "http://localhost:3001"),
        api_key=os.environ.get("SERVICE_API_KEY", "dev-service-key"),
    )
    config = BacktestConfig(periods_per_year=periods_per_year(TIMEFRAME, "equity"))
    criteria = GateCriteria()

    vix = await fetch_cboe_closes("VIX")
    vix3m = await fetch_cboe_closes("VIX3M")
    if not (is_successful(vix) and is_successful(vix3m)):
        print("  macro fetch failed")
        return
    regime: RegimeSeries = ratio_regime(vix3m.unwrap(), vix.unwrap(), threshold=1.0)

    svxy = await _fetch(gateway, "SVXY")
    spy = await _fetch(gateway, "SPY")
    if svxy is None or spy is None:
        return
    print(
        f"\n  SVXY: {len(svxy)} {TIMEFRAME} bars ({svxy[0].ts[:10]} → {svxy[-1].ts[:10]}); "
        f"regime risk-off {regime.risk_off_frac * 100:.0f}% of macro observations. "
        f"Pre-registered trials: N={TRIALS}.\n"
    )

    spy_hold = walk_forward("spy_hold", "SPY", spy, buy_and_hold, config)
    print(f"  {'control: SPY buy-and-hold':28} "
          f"{_fmt(spy_hold, evaluate(spy_hold, criteria).passed)}")
    null = walk_forward("svxy_hold", "SVXY", svxy, buy_and_hold, config)
    print(f"  {'control: SVXY unfiltered':28} {_fmt(null, evaluate(null, criteria).passed)}\n")

    timed = regime_filtered(buy_and_hold, regime)
    sizings: list[tuple[str, Sizer]] = [
        ("timed.full", full_size),
        ("timed.vt25", vol_target_sizer(0.25, 20, config.periods_per_year)),
        ("timed.vt10", vol_target_sizer(0.10, 20, config.periods_per_year)),
    ]
    candidates: list[tuple[str, Sizer]] = []
    for label, sizer in sizings:
        r = walk_forward(label, "SVXY", svxy, timed, config, sizer=sizer)
        v = evaluate(r, criteria)
        print(f"  {label:28} {_fmt(r, v.passed)}")
        if not v.passed:
            print(f"       └─ blocks: {'; '.join(v.reasons)}")
        adds_value = r.oos_sharpe > null.oos_sharpe and r.oos_max_drawdown < null.oos_max_drawdown
        if v.passed and adds_value:
            candidates.append((label, sizer))

    if not candidates:
        print(
            "\n  Decision: 0 candidate passes out of N=3 — the timed vol-risk-premium sleeve is"
            "\n  refuted on this window. Per pre-registration: no second threshold, no VIX9D"
            "\n  variant, no long-VIXY leg gets tried this cycle."
        )
        return

    print(f"\n  Candidate passes: {[c[0] for c in candidates]} — confirming on SVIX (−1x)…")
    svix = await _fetch(gateway, "SVIX")
    if svix is None:
        print("  SVIX unavailable — confirmation impossible; candidates remain UNCONFIRMED.")
        return
    for label, sizer in candidates:
        r = walk_forward(f"{label}.svix", "SVIX", svix, timed, config, sizer=sizer)
        ok = r.oos_sharpe > 0
        print(f"  confirm {label:24} {_fmt(r, evaluate(r, criteria).passed)} "
              f"→ {'CONFIRMED (hypothesis, not edge)' if ok else 'FAILED confirmation'}")


if __name__ == "__main__":
    asyncio.run(main())
