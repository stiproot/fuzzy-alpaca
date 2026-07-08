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

## Where we stand

Across five cycles, 300+ configs and baskets on crypto + equities: **price/vol/volume TA is
exhausted as an edge source.** Its honest ceiling is the diversified equity bollinger
mean-reversion basket — **OOS Sharpe ≈ 0.43, drawdown ~7%, 100% positive folds** — genuine but
sub-threshold; the strongest paper-trial *candidate* on record (a clearly-labelled sub-threshold
observation run is defensible; presenting it as gate-cleared is not). The gate has refused every
config, correctly. Edge is now a **data problem, not a plumbing problem**: the next cycles pursue
richer signals — see the [backlog](experiments/backlog.md).
