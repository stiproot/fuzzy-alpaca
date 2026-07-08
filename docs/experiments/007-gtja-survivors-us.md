# Experiment 007 — Do vibe-trading's surviving GTJA alphas work cross-sectionally on US large caps?

| | |
|---|---|
| **Date** | 2026-07-08 |
| **Status** | refuted — 0/10 trials pass; best variant undercuts the passive control |
| **One-liner** | GTJA IC survivors don't transfer as US PnL: turnover×costs kills raw variants, and even the best smoothed one (0.44) sits below hold-all equal-weight (0.60) — which itself "passes" the gate, exposing that absolute Sharpe passes beta in bull windows |
| **Prev / Next** | [006](006-vix-regime-overlay.md) / [backlog](backlog.md) |

**Hypothesis.** The 5 GTJA-191 alphas that survived vibe-trading's 2018–2025 CSI-300 IC study
(`gtja191_171/111/163/054/002` — microstructure/reversal formulas over daily OHLCV;
[research](research/2026-07-08-vibe-trading.md)) carry signal that generalizes: ranked daily
across our 57-name US large-cap basket and held as a **long-top-quintile equal-weight portfolio**
with real costs, at least one clears our walk-forward gate. The null: they are A-share
microstructure artifacts plus survivorship bias, and ~100% daily turnover meets costs and dies.
US large caps are data the alphas were **not** selected on — a pass here is stronger evidence
than the original study; a fail refutes the claim for our purposes.

**Pre-registered method** (written before running):

- **Alphas, ported faithfully from `vibe-trading/agent/src/factors/zoo/gtja191/`** (per-name
  score; final cross-sectional ranking happens in the evaluator — the `rank()` inside 163/054 is
  order-preserving per day, so per-name scores suffice):
  - `gtja191_002` = −Δ₁( ((C−L)−(H−C)) / (H−L) )
  - `gtja191_054` = −( std(|C−O|,10) + (C−O) + corr(C,O,10) )
  - `gtja191_111` = ewmₐ₌₂/₁₁(x) − ewmₐ₌₂/₄(x), x = V·((C−L)−(H−C))/(H−L)
  - `gtja191_163` = (−ret₁)·mean(V,20)·VWAP·(H−C), with VWAP = (O+H+L+C)/4 — their own
    `equity_us` fallback (`factors/base.py::vwap`)
  - `gtja191_171` = −((L−C)·O⁵) / ((C−H)·C⁵)
  - Undefined values (e.g. H=L days; |denominator| < 1e-12 per their `safe_div`) → name excluded
    from that day's ranking.
- **Portfolio construction:** each day t (after warmup 45 bars), rank eligible names by score
  computed on data through t; hold the top 20% (k = round(0.2·n), min 1) equal-weight from close
  t to close t+1. Turnover cost = (entries + exits)/k × cost-per-side.
- **Variants: exactly 2 per alpha** — raw daily score, and the single pre-registered turnover
  mitigation: **20-day rolling mean of the daily score** (`smooth20`). **N = 10 trials.**
- **Costs:** primary decision at **10 bps per side** (commission-free US large caps + spread/
  slippage); 5 and 20 bps reported as sensitivity, never used for the decision.
- **Everything else identical to Exp 005/006:** same 57-name basket, 1Day bars, 1000 most recent
  bars aligned, 4 folds, same gate, Sharpe annualized at 252.
- **Controls on identical data:** (a) SPY buy-and-hold (beta control, per Exp 006);
  (b) **hold-all** — the same cross-sectional machinery with top-fraction = 100% (isolates
  selection skill from the cost model and the universe's own drift).
- **Decision rule:** a variant is a *candidate pass* only if (i) it passes the full gate at
  10 bps, (ii) its Sharpe exceeds both controls. **Confirmation (data not selected on):** any
  candidate pass re-runs on a disjoint 30-name liquid basket (AVGO TSLA LIN ACN TMUS VZ T PM MO
  BMY GILD ISRG MDT SYK DE LMT RTX NOC FDX ADP MMC BLK SCHW USB PNC COP SLB EOG NEE DUK — zero
  overlap with the 57) and must show positive OOS Sharpe there. Zero candidate passes ⇒ the
  vibe-trading "winners" claim is **refuted for our universe** — logged, and we do not mine the
  remaining 186 GTJA alphas looking for one that fits (that would be the exact survivorship
  exercise their own strict bench warns about).

**Result — 0 / 10 candidate passes at the decision cost.** Window 2021-01-19 → 2025-01-08,
57 names, 1000 aligned 1Day bars, warmup 45. Decision rows (10 bps/side; 5/20 bps sensitivity in
the run output):

  | config | OOS ret | Sharpe | maxDD | +folds | entries | verdict |
  |---|---|---|---|---|---|---|
  | control: SPY buy-and-hold | +48.7% | 0.39 | 22.8% | 3/4 | — | (beta control) |
  | control: hold-all 57 @10bp | +58.5% | **0.60** | 22.8% | 3/4 | 228 | **gate-PASS** (see below) |
  | 002.raw / 054.raw / 163.raw | −43…−54% | −0.16…−0.68 | 57–65% | ≤1/4 | 6.5–8.7k | dead — costs |
  | 111.raw | +52.3% | 0.25 | 33.4% | 2/4 | 5264 | block |
  | 171.raw | −0.7% | 0.07 | 43.6% | 1/4 | 7243 | block |
  | **054.smooth20** (best) | **+132.5%** | **0.44** | **21.8%** | 3/4 | 909 | block — and < hold-all |
  | 111.smooth20 | +24.5% | 0.25 | 33.6% | 3/4 | 1839 | block |
  | 163.smooth20 / 002.smooth20 | +2…−52% | 0.08…−0.68 | 50–53% | ≤3/4 | 0.7–7.3k | block |
  | 171.smooth20 | +17.4% | 0.21 | 31.3% | 2/4 | 1384 | block |

Cost sensitivity confirms the mechanism: every raw variant is positive-ish at 5 bps and deeply
negative at 20 — the signal, where it exists, is smaller than the round trip. No confirmation run
was triggered.

**Conclusion — the claim is refuted for our universe, in two layers.** (1) *Transfer failure:*
1-day rank-IC on a survivorship-biased CSI-300 panel does not survive contact with US large caps,
real turnover costs, and PnL accounting — consistent with vibe-trading's own strict-bench warning
(1 of 12 factors survived their random-control audit) and with McLean–Pontiff decay. Smoothing
(the one pre-registered mitigation) cuts turnover ~8× but also smooths away most of the signal.
(2) *The control finding may outlast the experiment:* **hold-all equal-weight of the 57-name
universe passes the gate outright (0.60 Sharpe, 22.8% DD)**. An absolute-Sharpe gate passes
passive beta in a bull window — so for long-only equity candidates, gate-pass alone is no longer
meaningful; **beating the hold-all and SPY controls on identical folds is the real bar** (this
cycle's decision rule already enforced that; it is now the standing rule). It also reframes
cycle 5: the 0.43 mean-reversion basket underperforms simply *holding* its own universe.

**Why this is a good result.** The pre-registered N=10, decision-cost-fixed design meant ten
tempting-looking numbers (a +152% here, a 4/4-folds there) could not be shopped into a "pass";
the external repo's headline claim was tested on data it wasn't selected on and killed in one
run, with the refusal to mine the remaining 186 alphas recorded before the fact.

**Improve (done this cycle).** (1) Pure alpha-series layer (`application/alphas.py`) with a
**causality prefix-invariant test** over every alpha — lookahead is now a tested property, not a
hope. (2) `cross_sectional_walk_forward` (`application/cross_sectional.py`): top-K daily-ranked
portfolio through the same gate, with per-side turnover costs — the evaluator backlog #4 needs,
now built and unit-tested. (3) Per-side cost surfaced as a first-class parameter with sensitivity
rows (backlog prerequisite #3). (4) Hold-all control added alongside the SPY control — both now
binding in the decision rule for long-only candidates.

**Next hypothesis (cycle 8).** Backlog #2, the **volatility-risk-premium sleeve** (SVXY timed by
VIX3M/VIX contango, vol-targeted) — deferred from cycle 7 by the vibe-trading exploration, its
macro ingest is already built, and as a *non-equity-beta* return stream it is judged against
cash, not a hold-all control that a bull window inflates. The cross-sectional machinery built
this cycle stays warm for backlog #4 (multi-factor composite with EDGAR fundamentals), which is
the highest-prior equity candidate — but it must now clear the hold-all bar, not just 0.5.
