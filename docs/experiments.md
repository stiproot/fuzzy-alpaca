# Experiments

The running, human-readable log of what we've tried to make paper money — especially what
**failed**, and why. We operate a loop: **research → document → experiment → update → improve →
repeat**. Nothing is cherry-picked; overfitting is called out, not hidden.

**The bar:** a strategy is only worth trading if it clears the walk-forward **gate**
(`GateCriteria`: OOS Sharpe ≥ 0.5, positive OOS return, drawdown ≤ 25%, ≥ 5 trades, ≥ 50% positive
folds) — and holds on data it was **not** selected on. A pass on a single window is a hypothesis,
not an edge.

Tooling: `apps/orchestrator/scripts/sweep.py` (grid → walk-forward gate),
`scripts/backtest.py` (single backtest). Both reuse the same pure gate machinery the live workflow
uses, so a research pass and a live decision agree by construction.

---

## Experiment 1 — Do any naive TA configs clear the gate on crypto? (2026-07-08)

**Hypothesis.** Our three strategies (sma_crossover, momentum, mean_reversion) fail on BTC/1Day
with default params, but the defaults are arbitrary. A modest, principled sweep of
(strategy × params) over BTC/ETH/LTC/SOL on 1Hour + 1Day might reveal a config that clears the
OOS gate — or confirm naive TA has no edge here.

**Method.** 72 configs (9 strategy/param variants × 4 symbols × 2 timeframes) through
`walk_forward` + the real gate. First pass used ~400 bars per series.

**Result — the trap, then the truth.**

- On **~400 bars**, **2 / 72 passed**: `meanrev_10 / BTC/USD / 1Hour` (OOS Sharpe 0.96, +2.1%) and
  `meanrev_20 / ETH/USD / 1Hour` (0.85, +3.5%). Tempting: same strategy family, same timeframe, two
  independent majors — looked coherent.
- **Confirmation on ~1000 bars (≈6 weeks of hourly)** — the honesty step — **refuted it
  completely**. Every mean-reversion config now blocks with strongly negative OOS Sharpe:

  | config | OOS return | OOS Sharpe | trades | gate |
  |---|---|---|---|---|
  | meanrev_10 / BTC/USD / 1H | −2.9% | −3.33 | 3 | block |
  | meanrev_20 / ETH/USD / 1H | −5.7% | −1.85 | 5 | block |
  | meanrev_10 / ETH/USD / 1H | −9.0% | −2.82 | 14 | block |
  | (…all 8 mean-rev configs on deep data) | negative | −1.6 to −3.3 | — | block |

**Conclusion.** **No robust edge.** The two 400-bar passes were short-window false positives —
classic multiple testing (try 72 things, 2 look good by luck) — and they **evaporated on more
data**. Naive price-only TA (crossover / momentum / mean-reversion) does **not** beat fees on the
crypto symbols/timeframes/params tested.

**Why this is a *good* result.** The gate + hold-out confirmation caught a mirage **before** a
single dollar of paper money touched it. This is the safety machinery working exactly as designed —
and it's why we don't run live experiments on strategies that only look good in-sample.

**Improve (done this cycle).** Encoded the lesson in `sweep.py`: it now evaluates on **deep
windows (1000 bars) by default**, so short-window flukes don't surface as passes, and prints a
multiple-testing caveat with the pass count. The 400-bar false positives no longer appear.

**Next hypothesis (cycle 2).** Naive price-only TA looks exhausted on these assets. Options to
research: (a) signals beyond price — volatility regime, volume, cross-asset — since pure
price-TA edge on liquid crypto is largely arbitraged away; (b) longer-horizon or
different-universe (equities) where these patterns historically held better; (c) accept that easy
edge is absent and treat the system's value as the safety/execution infrastructure, pursuing edge
as a separate, ongoing research track. Decide and document before running.

---

## Experiment 2 — Do signals *beyond price* clear the gate on crypto? (2026-07-08)

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
