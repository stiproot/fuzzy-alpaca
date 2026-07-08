# Hypothesis backlog

The researched, prioritized queue of candidate strategies. Each entry is one falsifiable
hypothesis, ready to be pulled into a `docs/experiments/NNN-<slug>.md` file (from
[`TEMPLATE.md`](TEMPLATE.md)) at the start of a cycle. Full evidence and citations live in the
four research reports under [`research/`](research/):
[equity factors](research/2026-07-08-equity-factors.md) ·
[LLM/news sentiment](research/2026-07-08-llm-news-sentiment.md) ·
[event-driven/structural](research/2026-07-08-event-driven-structural.md) ·
[crypto non-price + base rates](research/2026-07-08-crypto-nonprice-signals.md) ·
[vibe-trading exploration](research/2026-07-08-vibe-trading.md).

**Context.** Five cycles established that price/vol/volume TA tops out at OOS Sharpe ≈ 0.43
(diversified equity mean-reversion basket, DD ~7%, 100% positive folds). The base-rate literature
says our gate (OOS Sharpe ≥ 0.5) is well calibrated for retail systematic trading — realistic
single-sleeve ceilings are ~0.4–0.8, published edges decay ~50% post-publication, and backtest
Sharpe barely predicts live Sharpe (Quantopian: R² < 0.025 over 888 algos). So the modal outcome
of every entry below is a *fail*, and that's fine — the queue is ordered so the cheap, high-odds
tests run first and every kill is cheap.

## The queue

| Pri | Candidate | Family | Expected net Sharpe | Gate odds | Build cost | Data |
|---|---|---|---|---|---|---|
| ~~1~~ | ~~VIX term-structure overlay on the 0.43 basket~~ — ran as [006](006-vix-regime-overlay.md), **refuted** | regime overlay | — | — | — | ingest built ✓ |
| **1b** | GTJA-survivor alphas cross-sectional on US large caps (vibe-trading's claimed winners) | cross-sectional microstructure | unknown; IC-level prior only | ~15–25% | M (bar→panel + cross-sectional evaluator, reusable for #4) | already have (Alpaca bars) |
| 2 | Vol-risk-premium sleeve (SVXY/VIXY timed by VIX3M/VIX) | structural premium | 0.4–0.8 | 35–45% | S (reuses #1's ingest) | CBOE + Alpaca bars |
| 3 | Overnight-only SPY/QQQ (+ weekend / post-earnings variants) | calendar anomaly | 0.0–0.3 | 10–20% | ~zero | already have |
| 4 | Long-only multi-factor composite (momentum × low-vol/quality × value) | cross-sectional | 0.5–0.7 (beta-heavy) | ~40%* | M–L (EDGAR ingest) | Alpaca + SEC EDGAR, free |
| 5 | DeepSeek news-sentiment signal (Alpaca News API) | LLM/text | 0.4–0.8 (decaying) | ~30% | M (news ingest + scorer) | Alpaca News, free; LLM ~$100–400 backfill |
| 6 | MVRV regime filter on long-only BTC | on-chain | 0.5–0.9, low confidence | plausible, low-N | S | Coin Metrics community, free |
| 7 | Funding-rate extreme derisk overlay (BTC/ETH) | derivatives positioning | 0.3–0.6 | coin-flip | S | Binance fapi, free |
| 8 | Earnings-announcement premium / liquid-universe surprise L/S | event-driven | 0.2–0.6 | 25–35% | M (calendar ingest, PIT-hygiene) | Finnhub/FMP free tiers |
| 9 | Stablecoin supply-growth regime filter | flow | 0.3–0.5 | likely fail | S | DefiLlama, free |

\* odds of a *meaningful* pass — see the beta caveat in "Harness prerequisites".

### ~~1. VIX term-structure regime overlay on the existing basket~~ — refuted

**Ran as [experiment 006](006-vix-regime-overlay.md) (2026-07-08): refuted on both pre-registered
variants** — a risk-off filter removes exactly the panic days a mean-reversion book earns on
(0.43 → 0.06 vix_ts / 0.33 hy_oas), and the new SPY beta control revealed the basket is only
~0.02 Sharpe over buy-and-hold. Keep the lesson: regime filters belong on long-beta/carry books,
not dip-buyers. The macro ingest (`infrastructure/macro.py`) and regime layer
(`application/regime.py`) are built and reusable — #2 consumes them directly.

### 1b. GTJA-survivor alphas on US large caps (vibe-trading's claimed winners)

**Hypothesis.** The 5 GTJA-191 alphas that survived vibe-trading's 2018–2025 IC study
(`gtja191_171/111/163/054/002` — microstructure/reversal formulas over OHLCV), computed daily on
our 57-name basket and held as a long-top-quintile cross-sectional portfolio with real costs,
clear our gate. **Why queued here.** User directive: the external repo's claimed winners get
tested first. And it's a *stronger* test than the original claim — US large caps are data the
alphas were not selected on, removing the survivorship bias their own study admits. **Priors.**
IC ≠ PnL; ~100% daily turnover meets real costs; theme distribution (microstructure/reversal
survive, momentum dead) matches our own cycles 4–5, which is mildly encouraging. Pre-register the
5 alphas + one turnover mitigation (20-day signal smoothing) = N≈10 trials. **Build.** Bar→pandas
panel adapter + a cross-sectional top-K portfolio evaluator through the same gate — reusable
verbatim for #4 (multi-factor composite), so the build is amortized.
[Details](research/2026-07-08-vibe-trading.md).

### 2. Volatility-risk-premium sleeve via vol ETPs

**Hypothesis.** Long SVXY when VIX3M/VIX > threshold (contango), flat otherwise, vol-targeted to
~5–8% ann. via the existing sizer, clears the gate as a standalone sleeve. **Why.** The
best-documented *structural* (not statistical) premium accessible without options: VIX futures in
contango ~80% of the time; literature Sharpe 0.4–0.8 net; daily-bar native; SVXY/VIXY are ordinary
Alpaca equities. **Risks.** Gap risk *is* the strategy (XIV −96% in one session, Feb 2018);
premium thinner post-2018; must backtest on real ETP bars (path-dependence), and sizing must
assume the day the signal can't save you — the 25% DD criterion is doing real work here.
[Details](research/2026-07-08-event-driven-structural.md) §6.

### 3. Overnight-only SPY/QQQ

**Hypothesis.** Holding SPY/QQQ close→open only (flat intraday) clears the gate; variants:
weekend-only, post-earnings-window only. **Why.** Zero integration — open and close are already in
our bars; refutation is nearly free and the gross effect is huge and well documented. **Honest
prior.** Net-of-cost evidence is bad (the NightShares ETFs liquidated in 2023 trying exactly
this); ~500 round trips/yr means 1–2 bps of auction slippage per side is 5–10%/yr drag. Expect a
kill; log it. [Details](research/2026-07-08-event-driven-structural.md) §1.

### 4. Long-only multi-factor composite on liquid large caps

**Hypothesis.** A monthly-rebalanced long-only tilt — composite rank of 12-1 momentum,
low-volatility, quality (gross profitability), value (earnings/FCF yield) — over ~300–500 liquid
names, with the existing vol-target layer, clears the gate on a universe it wasn't tuned on.
**Why.** Single factors net 0.2–0.4 post-decay; their low mutual correlation is the one robust
free lunch left in the factor literature; drawdown profile (esp. with low-vol/quality) suits our
DD ≤ 25% gate. **Build.** SEC EDGAR companyfacts ingest (free, no key; point-in-time via filing
*acceptance dates* — the lookahead trap is using restated data); low-vol and momentum sleeves need
prices only, so a prices-only composite can ship first. **Trap.** A long-only tilt can pass on
beta alone — see harness prerequisite (a). Long-short variants are researched-and-declined
(momentum L/S: −81% DD post-2006). [Details](research/2026-07-08-equity-factors.md).

### 5. DeepSeek news-sentiment signal (equities)

**Hypothesis.** Nightly DeepSeek scoring of Alpaca/Benzinga headlines (fixed prompt, temperature
0, {-1,0,1} per anonymized headline, averaged per symbol) produces a daily cross-sectional signal
that (a) tilts the existing basket for +Sharpe, or (b) clears the gate as a standalone long tilt.
**Why.** The one direction that uses our LLM asymmetrically; anchor paper (Lopez-Lira & Tang) plus
a post-cutoff replication showing net Sharpe 1.06 vs 0.79 baseline as a *tilt*. Data is free
(Alpaca News API, Benzinga, history to 2015, crypto included); scoring the full archive is
~$100–400 of DeepSeek once. **Hard constraints (binding, from the contamination literature).**
Gate evidence only on **post-model-cutoff data** (~2025→now for current DeepSeek — short!); pin
the model version; anonymize tickers/company names in prompts; key strictly on `created_at`;
trade next open. Pre-cutoff backtests are plausibility checks, never gate evidence. **Prior
caveat.** The one paper testing DeepSeek specifically found its news signals *don't* forecast
(unlike GPT) — validate DeepSeek score quality against a small GPT sample (~$5) before building
the full pipeline. [Details](research/2026-07-08-llm-news-sentiment.md).

### 6. MVRV regime filter on long-only BTC

**Hypothesis.** Scaling BTC exposure by MVRV Z-score bands (full when cheap/neutral, reduced when
extreme) beats vol-targeted buy-and-hold on Sharpe *and* holds DD ≤ 25% — the drawdown control
vol-targeting couldn't deliver without killing Sharpe (Exp 003). **Why.** The only non-price
crypto signal with peer-reviewed multi-cycle evidence; slow enough to survive 15–25 bps fees;
free verified data (Coin Metrics community API, `CapMVRVCur`). **Honesty.** ~3 independent cycle
observations ever — a pass is a low-confidence hypothesis by construction; benchmark against
vol-targeted (not raw) buy-and-hold; max two thresholds, no NUPL/CVDD/SOPR variant-shopping.
[Details](research/2026-07-08-crypto-nonprice-signals.md) §2.

### 7. Funding-rate extreme derisk/contrarian overlay

**Hypothesis.** Derisking BTC/ETH spot when perp funding is percentile-extreme positive (and
confirming longs at extreme negative) improves on the vol-targeted baseline. Continuous funding→
return prediction is provably ~zero (Presto); only the tail version is defensible. Free Binance
fapi history to 2019. Few events → wide CIs; check it isn't momentum in a hat.
[Details](research/2026-07-08-crypto-nonprice-signals.md) §1.

### 8. Earnings-announcement premium / liquid-universe surprise portfolio

**Hypothesis.** (a) Long-only premium: hold names with confirmed announcements in the next 1–10
days, exit after the report; (b) surprise L/S in the top-500-liquidity universe, entered T+1,
held 20–60 days. **Why deferred.** The one real data integration in the equity queue (earnings
calendar + surprises; point-in-time consensus is the classic leakage trap — prefer the
announcement-day abnormal-return SUE proxy computable from bars + calendar alone). Classic PEAD
is dead in the tradeable universe; the *premium* variant is the alive large-cap version.
[Details](research/2026-07-08-event-driven-structural.md) §3.

### 9. Stablecoin supply-growth regime filter

**Hypothesis.** 30/90d aggregate stablecoin supply growth > 0 as risk-on gate for BTC/ETH beats
the vol-targeted baseline. Serious reverse-causality evidence and a likely post-2025 structural
decoupling; one cheap cycle (DefiLlama, single curl), expect refutation.
[Details](research/2026-07-08-crypto-nonprice-signals.md) §3.

## Observation track (not gated candidates)

- **Sub-threshold basket observation run** — the 0.43 basket, clearly labelled sub-threshold,
  paper-only, for live-behavior data (slippage, fill quality, operational bugs). Never presented
  as gate-cleared (Exp 005 conclusion).
- **BTC ETF flow pipeline** — flows predict next-day returns in the 2024–25 sample, but ~2.5y of
  data can't support a multi-fold gate. Build the ingest cheaply, observe on paper, revisit 2027.

## Harness prerequisites (fold in before/with the first cycles)

1. **Benchmark controls on identical folds** — report SPY buy-and-hold Sharpe next to every
   equity result (a long-only tilt can pass on beta alone), and *vol-targeted* buy-and-hold next
   to every crypto overlay (or we rediscover vol-targeting in disguise).
2. **Trial-count logging + deflated-Sharpe sanity check** in `sweep.py` — ~100 configs/cycle
   means one nominal pass per cycle *by luck* (Bailey–López de Prado; Harvey-Liu-Zhu t ≥ 3).
3. **Per-side cost parameter** (sweep 5/10/20 bps equities) — several candidates live or die on
   costs; the harness must make that visible, not assumed.
4. **Slow-signal fold handling** — count exposure changes (not round trips) toward the ≥5-trades
   criterion and support ≥1–2y folds, or regime-filter candidates (#1, #6, #7, #9) can never
   satisfy the gate as written.
5. **LLM signal protocol** (for #5) — pinned model version, anonymized prompts, `created_at`
   keying, post-cutoff-only gate windows, raw prompt/output logging.

## Researched and declined (kills on record — don't re-litigate without new evidence)

- **Classic PEAD (SUE-based)** — dead in non-microcaps since ~2006 (Martineau); 2025 "revival" is
  a microcap artifact; costs consume 63–100% of paper profits.
- **Pairs trading / ETF stat-arb / GOOG-GOOGL** — net-unprofitable post-2002 (Do & Faff); same
  mean-reversion family as our exhausted 0.43 track; share-class edge is basis points at low
  frequency.
- **Index add/delete events** — classic effect dead (Greenwood-Sammon); retail-revival version is
  low-N, latency-sensitive, and historical announcement data isn't freely available (un-backtestable).
- **Standalone value L/S** — decade-scale drawdowns vs market; fails the folds criterion; only as
  a sleeve inside #4.
- **Crypto exchange flows / active addresses** — retroactive wallet-relabeling rewrites history
  (unfixable lookahead); no credible OOS evidence.
- **Crypto breadth** — price-derived; adjacent to the exhausted TA track.
- **Crypto news/social sentiment as standalone timing** — returns lead sentiment, not the reverse
  (Fear & Greed Granger study); at best a risk-off filter someday, expect ~0.
- **GDELT / macro news indices** — engineering cost out of proportion to daily-equity value.
