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

## Where we stand

Across six cycles, 300+ configs and baskets on crypto + equities: **price/vol/volume TA is
exhausted as an edge source.** Its honest ceiling is the diversified equity bollinger
mean-reversion basket — **OOS Sharpe ≈ 0.43, drawdown ~7%, 100% positive folds** — genuine but
sub-threshold, and (per cycle 6's new beta control) only ~0.02 Sharpe above SPY buy-and-hold on
identical folds; its real advantage is the risk profile (DD 7% vs 23%). Macro risk-off overlays
on it are refuted — they remove exactly the panic days a dip-buyer earns on (cycle 6). The gate
has refused every config, correctly. Edge is now a **data problem, not a plumbing problem**: the
next cycles pursue richer signals — see the [backlog](experiments/backlog.md); next up is the
vol-risk-premium sleeve, which reuses cycle 6's macro ingest on the strategy family it's
economically coherent for.
