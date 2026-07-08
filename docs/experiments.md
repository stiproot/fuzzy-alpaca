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

---

## Experiment 3 — Does risk management (volatility targeting) clear the gate on crypto? (2026-07-08)

**Hypothesis.** Experiment 2's beyond-price daily signals cleared every gate criterion *except*
drawdown. If drawdown is the only blocker, sizing exposure by risk — deploy `target_vol /
recent_realized_vol` of capital, so exposure falls in turbulent regimes — should pull drawdown under
25% while keeping enough return/Sharpe to pass.

**Method.** Added a pure position-sizing layer to the backtest engine (`application/sizing.py`;
default `full_size` = all-in, so the live path and all prior results are unchanged). Volatility
targeting at annualized targets 0.40 and 0.25 applied to the two best daily families
(`bollinger_20_2`, `donchian_20_10`); 80 configs total through the same gate.

**Result — 0 / 80 passed. Vol targeting works, but only moves *along* the frontier.** On the one
asset with any edge, ETH/1Day, sizing traded Sharpe for drawdown one-for-one:

  | config | OOS ret | Sharpe | maxDD | +folds | verdict |
  |---|---|---|---|---|---|
  | bollinger_20_2 (all-in) | +57.8% | **0.60** | 44.6% | 75% | fails DD |
  | bollinger_20_2 .vt40 | +22.8% | 0.47 | 28.8% | 75% | fails DD **and** Sharpe |
  | bollinger_20_2 .vt25 | +12.9% | 0.40 | **18.5%** | 75% | fails Sharpe |
  | donchian_20_10 .vt25 | +21.5% | 0.45 | **24.3%** | 50% | fails Sharpe |

There is **no** setting where Sharpe ≥ 0.5 and DD ≤ 25% hold together — the risk/return frontier
passes just *below* the gate's corner. And ETH is the only symbol with positive Sharpe at all
(BTC .vt25 0.24, LTC 0.18, SOL negative), so even the near-miss doesn't generalize.

**Conclusion — the crypto price/vol/volume TA track is exhausted.** Across three cycles we have now
shown, on BTC/ETH/LTC/SOL: (1) naive close-only TA has no directional edge; (2) beyond-price signals
have a real but drawdown-heavy edge on ETH that fails on risk; (3) risk management can tame the
drawdown but only by lowering Sharpe in lockstep — it cannot manufacture risk-adjusted edge. The
honest verdict: **no robust, generalizing strategy clears the gate on these crypto majors with
price-derived signals, with or without risk control.** The gate has, correctly, refused all 224
configs tried across the three cycles.

**Why this is the right outcome.** The machinery keeps doing its job: it distinguishes "looks
profitable" (SOL riding a bull run, +4192%) from "is a robust risk-adjusted edge" (nothing), and it
never let a single unproven config near the money path.

**Improve (done this cycle).** Position-sizing abstraction in the engine (`Sizer`), a volatility-
target sizer, threaded through backtest → walk-forward → sweep, unit-tested — reusable for any future
universe, and defaulted off so live order safety is untouched.

**Next hypothesis (cycle 4).** Change the **universe**, not the signal. Trend-following on **equity
indices / large-cap ETFs** is the most robustly documented systematic edge and historically survives
a 25% drawdown gate (managed-futures / time-series momentum). The gateway already serves equity bars
(verified SPY/QQQ/AAPL). Re-run the *same* signals + risk layer on daily equities with equity-session
annualization (252/yr). If trend clears the gate on equities, that is the first genuine trial
candidate; if not, the evidence favors treating the safety/execution infrastructure as the
deliverable and pursuing edge (cross-asset, funding, on-chain, alternative data) as a separate track.

---

## Experiment 4 — Do the signals clear the gate on equities? (2026-07-08)

**Hypothesis.** Crypto price-TA is exhausted (Exp 1-3). Equities have structurally smaller drawdowns
and documented trend/reversion effects; the *same* signals + risk layer, on daily large-caps with
equity-session annualization (252/yr), might finally clear the gate.

**Method.** Added an asset-class-aware universe loop to the sweep (`periods_per_year(tf,
asset_class)`). Ran the full 10-config grid first on 5 equities, then on a **held-out cross-sector
basket of 18 large-caps** (SPY QQQ AAPL MSFT NVDA GOOGL AMZN META JPM JNJ XOM KO WMT HD PG V UNH COST).

**Result — the first gate passes, but all single-name.** 7 / 260 configs passed:

  | strategy | symbol | OOS ret | Sharpe | maxDD | +folds | family |
  |---|---|---|---|---|---|---|
  | donchian_20_10 (×3 sizings) | COST | +103.4% | **0.66** | 10.2% | 100% | trend |
  | momentum_20 | COST | +89.0% | 0.54 | 14.3% | 100% | trend |
  | bollinger_20_2 (×3 sizings) | MSFT | +66.2% | **0.53** | 13.4% | 100% | reversion |

Two things are immediately true and important: (1) **equity drawdowns are gate-compatible by
construction** — most configs sit at 9-25% DD, not crypto's 45-78%; the DD wall that blocked cycle 2-3
is largely gone. (2) Every pass is a **single name** — COST (an unusually smooth trender) and MSFT —
which is exactly the multiple-testing pattern the gate's caveat warns about.

**The signal in the noise.** Looking past individual passes to the *distribution*, one family stands
out: **bollinger mean-reversion is positive on 15 of 18 held-out names** (mean OOS Sharpe 0.19,
returns positive on 15/18, drawdowns mostly <25%). Pure noise would scatter Sharpe symmetrically
around zero; this is clearly **right-skewed positive** — a real but *weak* per-name edge, of which
MSFT (0.53) is the right tail. Trend (donchian/momentum) does *not* show this breadth — it is negative
on many names (NVDA -77%, MSFT -3%) and only COST clears; those passes are isolated tails.

**Conclusion.** Equities give us the first genuine gate passes — but **no single-name pass should be
trialed as-is**: MSFT-bollinger and COST-trend are the right tails of 260 tries. The durable finding
is that **bollinger mean-reversion is a broad, weak, positive edge across large-caps**. A weak edge
that is *consistently* positive across many low-correlation names is the textbook setup for
**diversification**: an equal-weight basket averages 15 positive-expectancy streams, so the portfolio
Sharpe should exceed any single name's and plausibly clear the gate *robustly* — not by overfitting to
one ticker.

**Improve (done this cycle).** Sweep is now asset-class-aware (crypto + equity universes, correct
annualization each). The whole signal + risk stack runs unchanged across both.

**Next hypothesis (cycle 5).** Build a **portfolio** evaluation: run bollinger mean-reversion on every
name in the large-cap basket, equal-weight the per-name OOS curves into one portfolio curve, and gate
*that*. Question: does diversifying the weak-but-broad per-name edge lift the portfolio OOS Sharpe
clear of 0.5 with DD ≤ 25%? If yes, the diversified basket — not any single ticker — is the first
strategy worth a gated paper trial. If even the basket falls short, the honest verdict is that the
system's value is the safety/execution infrastructure, with edge pursued as a separate data track.
