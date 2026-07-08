# Research: LLM- and news/text-driven trading signals (2026-07-08)

*One of four parallel research reports feeding [the backlog](../backlog.md). Constraints assumed:
DeepSeek-scored signals feeding a deterministic, backtestable pipeline on Alpaca; walk-forward gate
(OOS Sharpe ≥ 0.5, DD ≤ 25%).*

---

## Candidate 1: LLM-scored news-headline sentiment → next-day cross-sectional equity signal

**The core evidence.** Lopez-Lira & Tang, ["Can ChatGPT Forecast Stock Price Movements?"](https://arxiv.org/pdf/2304.07619) ([SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4412788), revised through Oct 2025, v6 on arXiv) is the anchor paper. Method: feed each stock-tagged headline to GPT with a fixed prompt ("good/bad/unknown for the stock price of X?"), map to {1, 0, -1}, average per stock per day, trade long-short at next open, hold open-to-close. Sample Oct 2021–May 2024, deliberately starting after GPT-3.5/4's Sep 2021 training cutoff to be out-of-sample by construction.

Key numbers:
- Long-short GPT-4 strategy: ~38 bps/day pre-cost; cumulative >650% Oct 2021–Dec 2023; still >300% (>150%) cumulative assuming 5 (10) bps round-trip costs.
- **Alpha decay is severe and monotonic**: annualized Sharpe 6.54 (2021Q4) → 3.68 (2022) → 2.33 (2023) → **1.22 (Jan–May 2024)**. The edge is being arbitraged as LLM reading of news becomes commoditized.
- Predictability concentrates in **small-cap stocks and negative news** — exactly where shorting is hard, borrow is expensive, and spreads eat the paper edge. [Larry Swedroe's summary](https://larryswedroe.substack.com/p/can-chatgpt-forecast-stock-price) notes the strategy beats the market only if per-transaction costs are ≤ ~25 bps; for retail-size orders in small caps that is not guaranteed.

**Follow-up with cleaner OOS design.** ["ChatGPT in Systematic Investing"](https://arxiv.org/html/2510.26228v1) uses GPT-4o-mini to tilt a monthly S&P 500 momentum portfolio by news-consistency scores; the test window (Jan 2024–Mar 2025) is entirely post-knowledge-cutoff. Result: net-of-cost Sharpe **1.06 vs 0.79 baseline** OOS, ~3.3% annualized alpha, but only significant at the 10% level over 15 months. This is the realistic large-cap number: an *increment* of ~0.2–0.3 Sharpe over a base strategy, not a standalone 6-Sharpe machine.

**DeepSeek-specific caveat (important for us).** [Chen et al., "ChatGPT and DeepSeek: Can They Predict the Stock Market and Macroeconomy?"](https://arxiv.org/pdf/2502.10008) finds **DeepSeek's news signals capture contemporaneous reactions but lack forecasting power**, while ChatGPT's signals predict (market-level) returns; they attribute it to weaker extraction of fundamentals-relevant information. This is aggregate/macro-level, not cross-sectional, but it is a direct warning: do not assume deepseek-chat replicates GPT-4 results. Benchmark DeepSeek scores against a small GPT-4o-mini sample (a few thousand headlines, ~$1–5) before committing; measure score agreement and signal IC separately.

- **Evidence quality:** Strong (peer-reviewed anchor paper + independent post-cutoff replication showing much smaller but positive effect). Decaying.
- **Realistic net expectation (2026):** long-short small-cap version likely not implementable at our cost/borrow reality; large/mid-cap daily long-short or long-tilt: net Sharpe **~0.4–0.8**, hit rate ~52–55% daily. Marginal against our gate — plausible pass, not a layup.
- **Data + integration:** Alpaca News API (below); score with deepseek-chat via fixed prompt → per-symbol daily score in state store → deterministic portfolio construction; signal is a plain number, fully backtestable through `scripts/backtest.py`.
- **LLM cost:** Benzinga via Alpaca averages [130+ articles/day](https://docs.alpaca.markets/us/docs/historical-news-data). Headline-only scoring ≈ 200–400 tokens/article → **<$0.10/day** live at deepseek-chat prices (~$0.27/M input, ~$1.10/M output; cache hits far cheaper). Scoring the full 2015→now Alpaca archive (~500K articles, headline+summary) ≈ 300–700M tokens ≈ **$100–400 one-off**. Trivial.
- **Implementation shape:** nightly batch: fetch news since prior close → dedupe → score (temperature 0, forced JSON, {-1,0,1} + confidence) → aggregate per symbol → rank → orders at open. LLM never sees prices or makes decisions.
- **Failure modes:** alpha decay (the trend line points at zero); costs/borrow in small caps; DeepSeek scoring quality; prompt/model-version drift breaking score comparability mid-backtest (pin model version, log raw outputs); thin news coverage per symbol → few trades, gate's ≥5-trade/fold rule matters.

---

## Candidate 2: Alpaca News API as the data backbone (+ alternatives)

**Alpaca News API** ([docs](https://docs.alpaca.markets/us/docs/historical-news-data), [launch post](https://alpaca.markets/blog/introducing-news-api-for-real-time-fiancial-news/)):
- Source: **Benzinga only** ([partnership](https://alpaca.markets/blog/alpaca-partners-with-benzinga-to-deliver-real-time-embedded-financial-news/)). History **back to 2015**, ~130+ articles/day, stock **and crypto** symbols.
- REST `/v1beta1/news` ([reference](https://docs.alpaca.markets/reference/news-3)): `start`/`end`, `symbols`, `limit` ≤ 50/page, `page_token` pagination, `include_content`; response has `created_at`, `updated_at`, headline, summary, content, symbols, source. Plus a **real-time websocket stream** for live operation.
- **Free with existing market-data plan**; rate limits 200 req/min (free) / 10K (paid). Full 2015→now backfill ≈ 10K requests ≈ under an hour at free-tier limits.
- This is the right default: same vendor as broker, free, decade of history, crypto coverage included.

**Point-in-time pitfalls specific to it (see Candidate 4):** sort/default filtering is by **updated** date; Benzinga revises articles, so a backtest keyed on `updated_at` (or using revised `content` as if known at `created_at`) leaks. Backfill once, key everything on `created_at`, and accept that symbol tagging itself may have been revised historically (unverifiable — a residual risk).

**Alternatives:**
- [Polygon](https://polygon.io/) — news also Benzinga-sourced now, plus [point-in-time-by-ticker design](https://github.com/shinathan/polygon.io-stock-database) that avoids survivorship in the price data; redundant with Alpaca for news, useful as cross-check.
- [Tiingo News API](https://www.tiingo.com/products/news-api) — ~20M articles, **two decades** of multi-source history, tags on company/product mentions not just tickers; but full historical news access requires commercial licensing above the [$30/mo Power plan](https://www.tiingo.com/about/pricing) (free tier queries only ~3 months of news history). The upgrade path if Benzinga-only coverage proves too thin.
- [Finnhub](https://finnhub.io/finnhub-stock-api-vs-alternatives) — company news on free tier but shallow history for free users.
- **GDELT** — free, global, 15-min cadence, but article *metadata* (URLs, themes, machine tone), no full text, weak ticker mapping; suited to macro/geopolitical risk indices, not per-stock signals. High engineering cost for marginal daily-equity value.

- **Evidence quality / verdict:** infrastructure, not a strategy — Alpaca/Benzinga is clearly sufficient for a first cycle; single-source dependence (Benzinga editorial mix has changed over 10 years — regime non-stationarity in the corpus itself) is the main caveat.

---

## Candidate 3: Earnings-call / filings (8-K, 10-K) tone and guidance analysis

**Evidence.** The strongest work is Kim, Muhn & Nikolaev (Chicago Booth): ["Financial Statement Analysis with Large Language Models"](https://www.chicagobooth.edu/research/fama-miller/finance-research/funding/a-demand-system-approach-for-fixed-income/financial-statement-analysis-with-large-language-models) — GPT-4 given **anonymized, standardized** financial statements beats the median analyst at directional earnings forecasts, and long-short portfolios on its predictions earn higher Sharpe/alpha than ML baselines; anonymization argues against pure memorization. Related work ([PCAOB overview](https://assets.pcaobus.org/pcaob-dev/docs/default-source/economicandriskanalysis/conference/conference---spring/session_4_kim_muhn_nikolaev_tan.pdf)) extends to risk extraction from calls. On calls specifically, evidence is more mixed: [benchmark work](https://arxiv.org/html/2505.16090v1) finds overall transcript tone is a weak predictor (segment-level sentiment matters more; positive tone can even signal over-optimism), and [ECC Analyzer](https://dl.acm.org/doi/fullHtml/10.1145/3677052.3698689) shows calls predict **volatility** better than direction. A [hedge-fund-perspective review](https://arxiv.org/pdf/2605.05211) flags data leakage, illiquidity premia, and fragile sentiment pipelines as chronically understated in this literature.

- **Evidence quality:** Medium-strong for *earnings prediction from anonymized fundamentals*; medium-weak for *call-tone → next-day return*.
- **Realistic expectation:** event-study style — post-earnings drift enhancement. Hit rate maybe 53–58% on earnings events; but events per symbol are quarterly, so a small universe yields **few trades** — a direct conflict with our fold-level trade-count gate unless universe is ~200+ names.
- **Data + integration:** 8-K/10-K/10-Q free from **SEC EDGAR** (point-in-time by construction — filing timestamps are authoritative, a big backtestability advantage). Transcripts are the hard part: not free at scale (Ninjas/FMP/paid APIs); Alpaca doesn't provide them.
- **LLM cost:** transcripts/filings are long (10K–100K+ tokens). Scoring ~30 filings/day at ~30K tokens ≈ 1M tokens/day ≈ **$0.30–1/day** live; a 5-year backtest over 1,000 firms ≈ tens of billions of tokens if naive — must extract sections (MD&A, guidance deltas) first. Still low hundreds of dollars with sectioning.
- **Implementation shape:** event-driven: 8-K filed → pull text → DeepSeek scores guidance direction change / tone delta vs prior quarter (structured JSON) → deterministic entry next open, hold N days. Cleanest contamination story of all candidates when combined with anonymization of the excerpt.
- **Failure modes:** transcript licensing cost; long-document scoring instability; earnings moves are gappy (overnight jump risk — the "signal" often can't be traded before the move); quarterly cadence starves the trade-count gate.

---

## Candidate 4: The backtestability / contamination problem (cross-cutting, CRITICAL)

**Look-ahead via model memory.** [Glasserman & Lin, "Assessing Look-Ahead Bias in Stock Return Predictions Generated by GPT Sentiment Analysis"](https://arxiv.org/pdf/2309.17322) ([JFDS version](https://www.pm-research.com/content/iijjfds/6/1/25)) test with **anonymized headlines** (company names stripped). Surprise: in-sample, anonymized headlines *outperform* — a "distraction effect" (the model's general knowledge of big firms pollutes sentiment reading) dominates memorization; out-of-sample, look-ahead disappears but distraction persists. Practical takeaway: **anonymize tickers/company names in prompts regardless of period** — it mitigates both problems and costs nothing.

**Quantifying the bias.** [Detecting Lookahead Bias in LLM Forecasts (arXiv 2512.23847)](https://arxiv.org/html/2512.23847v1) builds a "Lookahead Propensity" score (token-level memorization proxy): in-sample, memorization amplifies apparent return predictability by **~37%**, and the effect **collapses to zero right after the training cutoff**. Their sobering conclusion: masking/anonymization is only "mixed" as a fix; the honest control is **evaluating on post-cutoff data only**. Lopez-Lira & Tang and the systematic-investing paper both adopt exactly this design (sample starts after model cutoff).

**What this means for our harness (binding rules):**
1. The walk-forward gate must run on **post-knowledge-cutoff data for whichever DeepSeek version scores the news**. Current deepseek-chat versions have cutoffs in mid-2024/2025 → the clean OOS window is roughly **2025→now, i.e. ~1–1.5 years**. Pre-cutoff backtests are upper bounds/sanity checks only, never gate evidence.
2. **Pin the model version** and log raw prompts/outputs; a silent model upgrade mid-experiment changes cutoff and score distribution.
3. Score with **anonymized headlines** (replace ticker/company with a placeholder) and **never include the date** in the prompt.
4. News-data look-ahead is separate from model look-ahead: with Alpaca, key strictly on `created_at` (not `updated_at`), snapshot the archive once, and add a realistic execution lag (news at 15:59 cannot fill the 16:00 close — trade next open).
5. Multiple-testing discipline as usual: one prompt, one aggregation rule, pre-registered in the experiment file.

The short clean window is the single biggest structural constraint: it caps how many folds the gate can have and how much confidence any pass deserves.

---

## Candidate 5: Crypto news/social sentiment (long-only spot BTC/ETH)

**Evidence is genuinely weak.** The most careful recent study of the Crypto Fear & Greed Index (2018–2025) finds sentiment changes **do not Granger-cause Bitcoin returns and add little to next-day predictability — returns lead sentiment, not the reverse** ([ScienceDirect](https://www.sciencedirect.com/science/article/pii/S305070062600006X)). Positive-side evidence exists — ChatGPT-built sentiment from X data "significantly affects" BTC returns ([Emerald/CFRI](https://www.emerald.com/cfri/article/doi/10.1108/CFRI-05-2024-0278/1301717/Decoding-market-sentiment-the-power-of-ChatGPT-in)), and LLM multi-agent crypto-trading papers show sentiment/subjectivity components add return ([FS-ReasoningAgent](https://arxiv.org/html/2410.12464v3)) — but these are mostly contemporaneous-association or agentic-backtest designs with exactly the contamination and cherry-picking problems above, on assets whose 2020–2024 history any LLM has memorized in detail. Classification-accuracy work ([MDPI comparative study](https://www.mdpi.com/2504-2289/8/6/63)) shows LLMs read crypto news fine; reading ≠ predicting.
- **Realistic expectation:** as a standalone long-only BTC/ETH timing signal, expected net Sharpe **~0** on honest post-cutoff evaluation; at best a **risk-off filter** (exit/derisk on extreme negative news-flow) layered on an existing trend/carry position — asymmetric use matches long-only constraint.
- **Data:** Alpaca News covers crypto symbols in the same API (free); X/Twitter data is now expensive and unbacktestable point-in-time — avoid.
- **Cost:** same pennies-per-day scale.
- **Failure modes:** sentiment is a lagging mirror of price in crypto; single-asset time-series signal generates few independent trades (gate: folds/trade counts); our crypto TA track already died (Cycles 1–3) and this is only modestly richer information.

---

## Ranked shortlist

1. **Daily LLM news-sentiment, cross-sectional US equities (Candidate 1 on Candidate 2's data), anonymized headlines, mid/large-cap tilt or long-short** — best evidence, free data with 10y history, trivially cheap, drops into the existing harness as one number per symbol per day. Expect a marginal-but-real edge (net Sharpe ~0.4–0.8), and validate DeepSeek score quality against a small GPT sample first.
2. **News-sentiment overlay on an existing passing strategy** (tilt the Cycle-4/5 equity book by news score, per the [systematic-investing paper](https://arxiv.org/html/2510.26228v1)) — the most defensible use: +0.2–0.3 Sharpe increments compound with what already passed the gate, and one-variable-at-a-time fits the research loop.
3. **8-K/EDGAR event signal (guidance/tone deltas)** — best point-in-time data story (EDGAR timestamps), medium evidence, but transcript costs and low event frequency make it a later cycle.
4. **Crypto news risk-off filter** — cheap to test since the same pipeline scores crypto news, but prior expectation is near-zero; frame as a falsifiable "does negative news-flow filter improve BTC/ETH trend drawdowns" hypothesis, expect refutation.
5. **GDELT/macro news indices** — not worth the engineering at our scale.

## Honest validity threats

Every headline number in this literature should be assumed inflated. First, **contamination**: measured memorization inflates in-sample LLM predictability by ~37% and vanishes post-cutoff ([arXiv 2512.23847](https://arxiv.org/pdf/2512.23847)), and for current DeepSeek versions our clean evaluation window is only ~2025-onward — short enough that a gate pass will rest on one macro regime. Second, **publication survivorship**: we see the papers where LLM sentiment worked; the Lopez-Lira Sharpe fell ~80% within 2.5 years of publication (6.5 → 1.2), the best post-cutoff replication shows alpha significant only at the 10% level, and the one paper that tested DeepSeek specifically found **its signals don't forecast at all** — our exact model may be the weak link. Third, **costs and capacity**: the fat returns live in small-cap shorts around negative news, precisely where retail execution (spreads, borrow, overnight gaps, next-open fills on a daily-bar system) destroys paper edges; the honest cost-adjusted expectation is a modest increment, not a standalone strategy. The right posture: pre-register one prompt and one construction, backtest 2015–cutoff only as a plausibility check, let the post-cutoff walk-forward gate be the sole arbiter, and treat a first pass as a hypothesis to confirm on a universe it wasn't tuned on.
