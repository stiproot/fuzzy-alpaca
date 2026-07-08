# Experiment 004 — Do the signals clear the gate on equities?

| | |
|---|---|
| **Date** | 2026-07-08 |
| **Status** | partial — first gate passes (single-name, not trialable); broad weak reversion edge found |
| **One-liner** | 7/260 pass but all single-name tails; the durable finding is bollinger reversion positive on 15/18 held-out large-caps |
| **Prev / Next** | [003](003-volatility-targeting-crypto.md) / [005 — diversified basket](005-diversified-basket.md) |

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
