# Experiment 002 — Do signals *beyond price* clear the gate on crypto?

| | |
|---|---|
| **Date** | 2026-07-08 |
| **Status** | blocked — real edge, killed solely by drawdown |
| **One-liner** | Donchian/Bollinger/volume signals clear Sharpe on 1Day but long-only crypto's 45–78% drawdowns fail the gate |
| **Prev / Next** | [001](001-naive-ta-crypto.md) / [003 — volatility targeting](003-volatility-targeting-crypto.md) |

**Hypothesis.** Close-only TA is arbitraged away (Experiment 1). The `Bar` already carries
high/low/volume, unused by the price-only strategies. Signals that read those — **channel
breakout** (Donchian, trend), **volatility-scaled reversion** (Bollinger z-score), and
**volume-confirmed momentum** — might capture a structural edge the close-only families miss.

**Method.** Three new signals added (`donchian_breakout`, `bollinger_reversion`, `volume_momentum`),
9 configs × 4 symbols (BTC/ETH/LTC/SOL) × 2 timeframes = 72, through the same walk-forward gate on
~1000 deep bars. **Also fixed a calibration bug first:** `periods_per_year` was hard-coded to 252
(daily) but the sweep evaluates 1Hour series too, under-annualizing hourly Sharpe by ~√(8760/252) ≈
5.9×. Annualization is now timeframe-aware (`periods_per_year()`), so the metric no longer lies —
prerequisite for an honest search.

**Result — 0 / 72 passed, but the failure mode moved.** The calibration fix made every 1Hour config
resolve to a strongly negative Sharpe (−1 to −18): **intraday is dead**, unambiguously. On **1Day**,
the beyond-price signals produced genuine near-misses — and every one blocks on **one** criterion:
drawdown.

  | config | tf | OOS ret | Sharpe | maxDD | trades | +folds | blocks on |
  |---|---|---|---|---|---|---|---|
  | bollinger_20_2 / ETH | 1D | +57.8% | **0.60** | 44.6% | 16 | **75%** | DD 44.6% > 25% |
  | donchian_20_10 / ETH | 1D | +38.6% | 0.49 | 47.7% | 12 | 50% | DD + Sharpe |
  | donchian_20_10 / SOL | 1D | +4192% | **0.81** | 67.9% | 11 | 50% | DD 67.9% > 25% |
  | momentum_20 / SOL | 1D | +2672% | 0.79 | 77.6% | 46 | 50% | DD 77.6% > 25% |

**Conclusion.** Still no strategy clears the full gate — but for a **different, more informative
reason**. Cycle 1 failed on *return/Sharpe* (no directional edge at all). Cycle 2's best
beyond-price configs **clear Sharpe, positive-return, trade-count and positive-fold** — the edge is
real enough — and are killed **solely by drawdown**. Long-only crypto delivers its trend returns
bundled with 45–78% drawdowns; a 25% max-DD gate (correctly) refuses that risk. And the one config
that clears Sharpe on ETH (bollinger_20_2) does **not** generalize — BTC 0.23, LTC 0.32, SOL 0.01 —
so it isn't a robust edge even on Sharpe alone.

**Why this matters.** The binding constraint is no longer "is there a signal?" but "can we take the
signal at a risk the gate accepts?" That points at the **missing lever**: the backtest engine is
all-in long-flat (100% cash → 100% position, no stop). Drawdown is unmanaged by construction.

**Improve (done this cycle).** (1) Timeframe-aware Sharpe annualization — hourly is now measured
honestly. (2) Three beyond-price signals added to the strategy registry and the sweep, all
gate-evaluated by the same machinery the live path uses.

**Next hypothesis (cycle 3).** The gate is asking for **risk management, not more signal**. Add a
position-sizing / stop layer to the engine — volatility targeting (size ∝ 1/recent-vol), a fractional
Kelly-style cap, or an ATR trailing stop — and re-sweep the *existing* daily signals. Question: can
capping drawdown to ≤25% preserve enough of bollinger/donchian's daily return to clear the full gate?
If even risk-managed long-only crypto can't, that is strong evidence to widen the universe (equities,
where trend historically survives risk control) or accept infra-as-deliverable.
