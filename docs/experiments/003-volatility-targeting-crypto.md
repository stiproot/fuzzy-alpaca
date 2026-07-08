# Experiment 003 — Does risk management (volatility targeting) clear the gate on crypto?

| | |
|---|---|
| **Date** | 2026-07-08 |
| **Status** | refuted — crypto price/vol/volume TA track closed |
| **One-liner** | Vol targeting trades Sharpe for drawdown one-for-one; the frontier passes just below the gate's corner |
| **Prev / Next** | [002](002-beyond-price-signals-crypto.md) / [004 — equities](004-equities-signal-sweep.md) |

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
