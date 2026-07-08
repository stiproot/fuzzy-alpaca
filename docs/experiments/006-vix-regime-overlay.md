# Experiment 006 — Does a macro risk-regime overlay lift the basket over the gate?

| | |
|---|---|
| **Date** | 2026-07-08 |
| **Status** | refuted — both variants *reduce* basket Sharpe |
| **One-liner** | Risk-off filters remove exactly the panic days where mean-reversion earns: 0.43 → 0.06 (vix_ts) / 0.33 (hy_oas); and the new SPY control shows the basket's 0.43 is only ~0.02 above beta on Sharpe |
| **Prev / Next** | [005](005-diversified-basket.md) / [007 — GTJA survivors](007-gtja-survivors-us.md) |

**Hypothesis.** The 57-name bollinger mean-reversion basket (Exp 005: OOS Sharpe 0.43, DD 7.1%,
100% positive folds) is held back by a Sharpe shortfall of 0.07, not by drawdown. Gating the basket
flat during macro risk-off regimes — periods where mean-reversion entries historically bleed —
should remove enough bad days to lift OOS Sharpe over 0.5 without raising drawdown. Backlog #1;
evidence in [research/2026-07-08-event-driven-structural.md](research/2026-07-08-event-driven-structural.md) §5.

**Pre-registered method** (written before running anything; no threshold sweeps, no variant
shopping — the overlay multiple-testing surface is huge and this is exactly where mirages breed):

- **Exactly two regime variants, thresholds fixed a priori at the conventional values:**
  - **V1 `vix_ts`** — risk-on iff VIX3M/VIX daily-close ratio **> 1.0** (term structure in
    contango). Data: CBOE daily index history CSVs (free, verified).
  - **V2 `hy_oas`** — risk-off iff the ICE BofA US High Yield OAS (FRED `BAMLH0A0HYM2`) z-score
    over the trailing **120 observations** is **> +1.0** (credit spreads widening). Data: FRED CSV
    (free, verified), fetched from 2021-01-01 so the z-window is warm before the backtest window.
- **No lookahead, by construction:** a bar's regime is the latest macro observation **strictly
  before** the bar's date — yesterday's close decides today's action; gaps forward-fill through
  the same rule. Before any macro data (or an unwarm z-window): risk-on, i.e. delegate to the
  strategy — the overlay only ever *removes* exposure.
- **Mechanism:** pure signal wrapper — risk-off forces `sell` (exit to cash, paying real
  fees/slippage on the exit and any re-entry); risk-on delegates to the underlying signal
  unchanged.
- **Everything else identical to Exp 005:** same 57-name basket, 1Day bars, 1000 most recent bars,
  equal-weight `portfolio_walk_forward`, 4 folds, fees 25 bps + slippage 5 bps per fill, same gate.
- **Controls on identical folds/data (new harness capability, backlog prerequisite #1):**
  - Baseline basket (must reproduce ≈ 0.43 — sanity).
  - **SPY buy-and-hold** through the same walk-forward machinery — the beta control.
- **Trial count: N = 2** (two variants; controls aren't trials). One nominal pass out of two is
  weak evidence; both criteria below must hold.
- **Decision rule (pre-registered):** a variant is a *candidate pass* only if (i) it passes the
  full gate, (ii) its basket Sharpe exceeds the baseline basket's, and (iii) its Sharpe exceeds
  the SPY buy-and-hold control's on the same folds. **Confirmation:** a candidate pass must also
  *directionally improve* (not necessarily gate-pass) the `meanrev_20` basket — regime information
  should be strategy-agnostic risk state, not a bollinger-specific artifact. If neither variant
  clears, the conclusion is refuted — **do not try a third macro series this cycle.**

**Result — both variants refuted on every criterion of the decision rule.** Window
2021-01-19 → 2025-01-08, 57 names, 1000 aligned 1Day bars; vix_ts risk-off 8% of days, hy_oas 12%.
Baseline reproduced Exp 5 exactly (sanity ✓).

  | config | OOS ret | Sharpe | maxDD | +folds | trades | verdict |
  |---|---|---|---|---|---|---|
  | control: SPY buy-and-hold | +54.4% | **0.41** | 22.8% | 3/4 | 0 | (beta control) |
  | bollinger basket · baseline | +14.9% | **0.43** | 7.1% | 4/4 | 848 | block (Sharpe) |
  | bollinger basket · vix_ts | +1.4% | **0.06** | 7.3% | 2/4 | 888 | block — much worse |
  | bollinger basket · hy_oas | +11.2% | **0.33** | 7.1% | 4/4 | 824 | block — worse |
  | meanrev basket · baseline | −11.4% | −0.21 | 20.0% | 2/4 | 2828 | block |
  | meanrev basket · vix_ts | −26.1% | −0.58 | 29.8% | 1/4 | 3241 | block — much worse |
  | meanrev basket · hy_oas | −15.0% | −0.29 | 20.0% | 1/4 | 2820 | block — worse |

Decision rule: vix_ts — gate n, >base n, >SPY n, meanrev-confirm n → **refuted**. hy_oas — same →
**refuted**. Per the pre-registration, no third macro series was tried.

**Conclusion — the hypothesis was directionally wrong for this strategy family.** A macro risk-off
filter removes exactly the days a mean-reversion book earns its living: Bollinger reversion buys
panic dips, and backwardation/spread-widening days *are* the panic dips. Cutting 8% of days
(vix_ts) didn't trim losses — it amputated the profit engine (0.43 → 0.06) while *adding* trades
(848 → 888: forced exits + re-entries pay fees both ways). The economically-coherent use of a
risk-off regime filter is on a **long-beta or carry book** (trend, buy-and-hold, short-vol), not a
dip-buyer. Second, unplanned finding from the new control: **SPY buy-and-hold scores 0.41 on the
identical folds** — the basket's 0.43 edge over pure beta is a hair's width on Sharpe. What the
basket genuinely adds is the risk profile (DD 7.1% vs 22.8%, 4/4 positive folds vs 3/4) — worth
knowing before ever presenting 0.43 as "an edge over the market" rather than "market-like return
at a third of the drawdown".

**Why this is a good result.** The pre-registration worked exactly as designed: two variants,
thresholds fixed a priori, refuted in one run, no threshold-shopping temptation — a mirage surface
(overlay × series × threshold × lag) that could have burned weeks died in an afternoon, and the
kill is on record with a mechanism, not just a number.

**Improve (done this cycle).** (1) Pure regime layer (`application/regime.py`: date-indexed
`RegimeSeries` with strictly-before lookup — lookahead structurally impossible; `ratio_regime`,
`zscore_regime`, `regime_filtered`), unit-tested. (2) Macro data adapters
(`infrastructure/macro.py`: CBOE index CSVs, FRED series), Result-typed. (3) **SPY buy-and-hold
beta control** through the same walk-forward machinery — backlog harness prerequisite #1, now
standard: every future equity result should print it. (4) Trial-count reporting in the cycle
script (backlog prerequisite #2, first pass).

**Next hypothesis (cycle 7).** Backlog #2 — the **volatility-risk-premium sleeve**: long SVXY when
VIX3M/VIX > 1.0 (contango), flat otherwise, vol-targeted small. Two reasons it's next: (a) the
ingest and regime machinery built this cycle are exactly what it needs (same signal, opposite
use — *harvesting* risk-on instead of filtering a dip-buyer); (b) it is the strategy family for
which the term-structure signal is economically coherent — collecting the insurance premium only
while the term structure says insurance is overpriced. The 25% DD gate criterion does real work
here (unfiltered short-vol fails it by construction), and the backtest must use real SVXY/VIXY
bars, not index math.
