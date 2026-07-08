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
