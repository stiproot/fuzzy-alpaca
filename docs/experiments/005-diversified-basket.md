# Experiment 005 — Does a diversified basket lift the weak edge over the gate?

| | |
|---|---|
| **Date** | 2026-07-08 |
| **Status** | near-miss — sub-threshold; price-derived TA arc closed at OOS Sharpe ≈ 0.43 |
| **One-liner** | Diversification collapses DD to 6-7% with 100% positive folds, but can't manufacture Sharpe the raw signal lacks |
| **Prev / Next** | [004](004-equities-signal-sweep.md) / [006 — regime overlay](006-vix-regime-overlay.md) |

**Hypothesis.** bollinger mean-reversion is positive on ~75-83% of large-caps but weak per name
(Exp 4). An equal-weight, daily-rebalanced *basket* should diversify away idiosyncratic noise and lift
the portfolio OOS Sharpe over 0.5 while keeping drawdown low.

**Method.** Added `portfolio_walk_forward` (pure): each name runs the same long-flat strategy as an
independent 1/N sleeve (idle in cash when flat); the portfolio bar return is the mean of sleeve bar
returns; the stitched OOS curve goes through the *same* gate. Ran `scripts/portfolio.py` on an 18-name
mega-cap basket, then a **57-name broad cross-sector basket**, and tested equal-weight vs risk-parity
(per-sleeve volatility-normalized) weighting.

**Result — diversification works exactly as predicted, and lands just under the bar.**

  | basket | weighting | names+ | OOS ret | Sharpe | maxDD | +folds | gate |
  |---|---|---|---|---|---|---|---|
  | 18 mega-caps | equal | 15/18 | +24.0% | **0.50** | 6.5% | 100% | block (0.50 < 0.5) |
  | 57 broad | equal | 43/57 | +14.9% | **0.43** | 7.1% | 100% | block |
  | 57 broad | risk-parity .15 | 42/57 | +11.7% | 0.40 | 6.3% | 75% | block |
  | 57 broad | risk-parity .10 | 42/57 | +8.4% | 0.38 | 4.7% | 75% | block |

Diversification did its job: it collapsed drawdown from single-name 13-40% to **6-7%** and gave
**100% positive folds** — the basket made money in every out-of-sample window. But it cannot
manufacture Sharpe the raw signal lacks: the mega-cap 0.50 was mild name selection; the fair
broad-universe number is **0.43**. Risk-parity weighting only trades return for lower drawdown (Sharpe
drifts *down*) because these large-caps are already similar-vol — it is not the missing lever. Only
mean-reversion diversifies at all; momentum/trend/naive-meanrev baskets sit at or below zero Sharpe.

**Conclusion — the price-derived TA arc is closed, honestly.** Across five cycles and 300+ configs and
baskets on crypto and equities, the strongest robust, out-of-sample, generalizing result is a
diversified equity mean-reversion basket at **OOS Sharpe ≈ 0.43-0.50, drawdown ~7%, 100% positive
folds** — a *genuine but sub-threshold* edge. It clears every gate criterion **except** Sharpe, and no
weighting scheme closes the last hair. **The gate held.** It refused a candidate (the 18-name 0.50)
that a careless process would have traded, correctly exposing it as name-selection-inflated the moment
it faced a fair broad universe.

**Why this is the deliverable working.** The machinery took a weak, real signal all the way to its
honest ceiling and then *stopped* — no overfitting, no cherry-picked ticker, no in-sample mirage
reached the money path. The near-miss is itself the most useful signal we have: the edge is real and
low-risk; it just needs a **better signal**, not better plumbing or more leverage.

**Improve (done this cycle).** `portfolio_walk_forward` — a pure, gate-compatible basket evaluator
(equal-weight or risk-parity via the existing sizer), unit-tested (identical-sleeves invariant;
diversification never increases drawdown).

**Next hypothesis (cycle 6).** Price/vol/volume TA is exhausted as an edge source; its ceiling is
~0.43 Sharpe diversified. The productive direction is a **richer signal**, pursued as a separate track:
(a) fundamentals / cross-sectional ranking (value, quality, earnings drift); (b) cross-asset or
macro state (rates, credit, breadth); (c) the DeepSeek research agent proposing *non-price* features
to test through this same gate. The infrastructure — gateway, gate, walk-forward, portfolio evaluator,
sizing — is proven and reusable; edge is now a data problem, not a plumbing one. Meanwhile the
diversified mean-reversion basket (0.43, DD 7%, 100% folds) is the strongest paper-trial *candidate*
on record — worth a **gated, clearly-labelled sub-threshold observation run** if we want live-behavior
data, but it must not be presented as a gate-cleared strategy.
