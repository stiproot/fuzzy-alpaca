# Experiments

The running, human-readable log of what we've tried to make paper money — especially what
**failed**, and why. We operate one loop: **research → document → experiment → validate → document**
(the method lives in [`.claude/conventions.md`](../.claude/conventions.md)). Nothing is
cherry-picked; overfitting is called out, not hidden.

This file is the **log**: one row per experiment, linking the full record in
[`docs/experiments/`](experiments/) (one file per experiment, from
[`TEMPLATE.md`](experiments/TEMPLATE.md)). The prioritized queue of researched candidate
hypotheses lives in [`experiments/backlog.md`](experiments/backlog.md) — pull the next cycle from
there.

**The bar:** a strategy is only worth trading if it clears the walk-forward **gate**
(`GateCriteria`: OOS Sharpe ≥ 0.5, positive OOS return, drawdown ≤ 25%, ≥ 5 trades, ≥ 50% positive
folds) — and holds on data it was **not** selected on. A pass on a single window is a hypothesis,
not an edge.

Tooling: `apps/orchestrator/scripts/sweep.py` (grid → walk-forward gate),
`scripts/backtest.py` (single backtest), `scripts/portfolio.py` (basket evaluator). All reuse the
same pure gate machinery the live workflow uses, so a research pass and a live decision agree by
construction.

## Log

| # | Date | Question | Verdict |
|---|---|---|---|
| [001](experiments/001-naive-ta-crypto.md) | 2026-07-08 | Do any naive TA configs clear the gate on crypto? | **Refuted** — 2/72 short-window passes evaporated on deep data; naive price-TA has no edge |
| [002](experiments/002-beyond-price-signals-crypto.md) | 2026-07-08 | Do signals beyond price clear the gate on crypto? | **Blocked** — real 1Day edge (Sharpe to 0.81) killed solely by 45–78% drawdowns; intraday dead |
| [003](experiments/003-volatility-targeting-crypto.md) | 2026-07-08 | Does volatility targeting clear the gate on crypto? | **Refuted** — sizing trades Sharpe for DD one-for-one; crypto price-TA track closed (0/224 across cycles 1–3) |
| [004](experiments/004-equities-signal-sweep.md) | 2026-07-08 | Do the same signals clear the gate on equities? | **Partial** — 7/260 single-name passes (tails); durable finding: broad weak bollinger-reversion edge (15/18 names positive) |
| [005](experiments/005-diversified-basket.md) | 2026-07-08 | Does a diversified basket lift the weak edge over the gate? | **Near-miss** — 0.43–0.50 OOS Sharpe, DD 6–7%, 100% +folds; gate held at Sharpe < 0.5 |
| [006](experiments/006-vix-regime-overlay.md) | 2026-07-08 | Does a macro risk-regime overlay lift the basket over the gate? | **Refuted** — risk-off filters amputate mean-reversion's profit engine (0.43 → 0.06/0.33); new SPY control shows the basket is only ~0.02 over beta on Sharpe |
| [007](experiments/007-gtja-survivors-us.md) | 2026-07-08 | Do vibe-trading's surviving GTJA alphas work cross-sectionally on US large caps? | **Refuted** — 0/10 trials; costs kill raw turnover, best smoothed variant (0.44) < hold-all control (0.60), which itself gate-passes: absolute Sharpe passes beta in bull windows |
| [008](experiments/008-vol-risk-premium.md) | 2026-07-08 | Does term-structure-timed short-vol (SVXY) clear the gate? | **Refuted** — 0/3; day-lagged timing sells crash bottoms and re-buys after rebounds: timed Sharpe ≈ 0 / DD 57–72% vs unfiltered +37% / 0.23 — the signal subtracts value |

## Where we stand

Across eight cycles, 300+ configs and baskets on crypto + equities: **price/vol/volume TA is
exhausted as an edge source**, macro risk-off overlays on a dip-buyer are refuted (006), external
claimed winners failed to transfer as US PnL (007, 0/10), and daily-lagged term-structure timing
of vol ETPs *subtracts* value (008 — sells crash bottoms, re-buys after rebounds). The strongest
sub-threshold result remains the bollinger basket (0.43, DD ~7%, 100% +folds) — but the cycle 6–8
**controls reframed everything**: SPY buy-and-hold scores ~0.4, hold-all equal-weight of the
57-name universe scores **0.60 and passes the gate outright**, and unfiltered SVXY beats its own
timed version. Standing decision rules: long-only equity candidates must **beat SPY and hold-all
on identical folds**; timing overlays must **beat the untimed instrument on Sharpe and drawdown**.
The gate + controls have refused every strategy, correctly. Next up
([backlog](experiments/backlog.md)): the long-only multi-factor composite (momentum × low-vol,
prices-only first) through cycle 7's cross-sectional evaluator, judged against the hold-all bar.
