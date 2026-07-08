# Experiment 008 — Does term-structure-timed short-vol (SVXY) clear the gate?

| | |
|---|---|
| **Date** | 2026-07-08 |
| **Status** | refuted — 0/3; the timing signal *subtracts* value |
| **One-liner** | Day-lagged term-structure timing sells the crash bottom and re-enters after the rebound: timed −16…−25% / Sharpe ≈ 0 / DD 57–72% vs unfiltered SVXY +37% / 0.23 / 66% — worse than the null on every axis |
| **Prev / Next** | [007](007-gtja-survivors-us.md) / [backlog](backlog.md) |

**Hypothesis.** The volatility risk premium — VIX futures in contango ~80% of the time; the
roll-down is a structural insurance premium — is harvestable long-only via SVXY (−0.5x short-term
VIX futures ETF), *timed by the term structure*: hold SVXY only while VIX3M/VIX > 1.0 (contango),
flat in cash otherwise. Literature nets Sharpe 0.4–0.8 for timed versions
([research](research/2026-07-08-event-driven-structural.md) §6); unfiltered short-vol fails the
25% DD criterion by construction (SVXY −50% in two weeks, Mar 2020) — the timing signal and the
DD gate criterion are the experiment. Backlog #2; deferred from cycle 7.

**Why this family, after cycles 6–7.** It is the strategy for which the term-structure signal is
economically coherent (harvest risk-on, don't filter a dip-buyer — cycle 6's lesson), and it is a
**non-equity-beta return stream**, so the bull-window control problem from cycle 7 doesn't apply:
the honest null here is *unfiltered SVXY buy-and-hold*, not hold-all.

**Pre-registered method** (written before running):

- **Signal (fixed a priori, identical to Exp 006 V1):** risk-on iff VIX3M/VIX daily-close ratio
  > 1.0, applied via the existing `ratio_regime` + `regime_filtered` machinery — a bar's regime
  is the latest macro observation **strictly before** its date (no lookahead, forward-fill,
  risk-on default before data). Underlying signal = buy-and-hold SVXY; risk-off forces exit to
  cash with real fees/slippage.
- **Instrument:** real SVXY daily bars from Alpaca (never index math — ETP path-dependence is
  real). 1000 most recent bars, 4 folds, warmup 30, fees 25 bps + slippage 5 bps per fill,
  Sharpe annualized at 252 — all identical to the prior equity cycles.
- **Trials: N = 3** — the timed strategy under three pre-registered sizings: `full` (all-in),
  `vt25` (vol-target 0.25 ann.), `vt10` (vol-target 0.10 ann.) via the existing
  `vol_target_sizer` (window 20). No threshold sweeps: 1.0 is the only ratio threshold tried.
- **Controls on identical data (not trials):** (a) **unfiltered SVXY buy-and-hold** — the null;
  the timing signal must be the thing that passes, expected to fail on DD; (b) SPY buy-and-hold —
  context only, this sleeve is judged as an absolute-return stream.
- **Decision rule:** a sizing is a *candidate pass* only if (i) it passes the full gate,
  (ii) its Sharpe **and** its max drawdown both improve on unfiltered SVXY buy-and-hold (the
  signal must add risk-adjusted value, not just deleverage — cycle 3's lesson that sizing alone
  moves along the frontier). **Confirmation (different instrument, same claim):** any candidate
  pass re-runs on **SVIX** (−1x cousin) and must show positive OOS Sharpe with drawdown behavior
  consistent with its ~2x leverage. Zero passes ⇒ refuted; per the standing rule, no second
  threshold, no VIX9D variant, no long-VIXY leg gets bolted on this cycle.
- **Known tail risk, accepted into the record up front:** the premium pays for eating overnight
  vol spikes; a Feb-2018-style gap moves faster than a daily-close signal. A pass here is a
  hypothesis about a crowded, decaying premium — never presented as more.

**Result — 0 / 3 candidate passes; every timed variant is worse than the unfiltered null on
every axis.** Window 2021-01-19 → 2025-01-08 (1000 bars); regime risk-off 8% of observations;
13 round trips.

  | config | OOS ret | Sharpe | maxDD | +folds | trades | verdict |
  |---|---|---|---|---|---|---|
  | control: SPY buy-and-hold | +54.4% | 0.41 | 22.8% | 3/4 | — | (context) |
  | control: SVXY unfiltered (null) | **+37.2%** | **0.23** | 65.6% | 3/4 | 0 | block (DD) |
  | timed.full | −24.0% | 0.04 | 71.9% | 2/4 | 13 | block — worse than null |
  | timed.vt25 | −25.5% | 0.03 | 71.2% | 2/4 | 13 | block — worse than null |
  | timed.vt10 | −15.7% | 0.00 | 57.1% | 3/4 | 13 | block — worse than null |

**Conclusion — refuted, with a sharp mechanism.** The contango filter is **structurally late at
daily cadence**: backwardation appears only *after* the vol spike has already hit SVXY, so the
strategy sells into the crystallized loss; contango is restored only *after* the steepest part of
the rebound, so it re-buys high. Timing didn't trim the left tail — it converted unrealized
drawdown into realized losses, 13 times, and even *raised* max drawdown vs buy-and-hold (71.9% vs
65.6%: realizing each crash compounds worse than riding it). Vol-target sizing barely moved the
needle because entries happen in calm regimes where trailing vol is low and the sizer sits near
its cap (cycle 3's frontier lesson again). The literature's timed-Sharpe 0.4–0.8 is a pre-2018
artifact on this evidence; 2021–2025 contains exactly the post-2018 thinning and the 2024 losing
year the research flagged. Per pre-registration nothing else was tried — and per the standing
rule, this refutation covers daily-close term-structure timing of vol ETPs generally, not just
this threshold: the failure is the *lag structure*, which a different cutoff does not fix.

**Why this is a good result.** The null control did its job perfectly — without it, "timed
Sharpe 0.04, DD 72%" might have read as "vol ETPs are just bad"; with it, the record shows the
*signal itself* destroyed 0.19 of Sharpe that passive holding delivered. And the cycle cost
almost nothing: zero new engine code — regime layer (006) + sizers (003) + walk-forward (001)
composed directly, which is the harness compounding as designed.

**Improve (done this cycle).** None to the engine (deliberately). The durable addition is the
*null-instrument control* pattern: a timing overlay must beat the untimed instrument on Sharpe
**and** drawdown — now standing alongside cycle 7's hold-all/SPY rule in the decision-rule
toolkit.

**Next hypothesis (cycle 9).** The equity queue's strongest remaining prior: the **long-only
multi-factor composite** (backlog #4) — momentum × low-vol first (prices only, zero new
ingest; the cross-sectional evaluator from cycle 7 runs it as-is), EDGAR quality/value sleeves
added only if the prices-only composite shows life. Binding bar per cycle 7: beat SPY *and*
hold-all equal-weight on identical folds, monthly rebalance to keep turnover-×-cost survivable.
