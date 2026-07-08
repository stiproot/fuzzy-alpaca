# Research: non-price crypto signals + realism base rates (2026-07-08)

*One of four parallel research reports feeding [the backlog](../backlog.md). Scope: signals usable
on Alpaca long-only spot crypto (BTC/ETH/LTC/SOL, ~15–25 bps taker per side), daily/hourly bars,
retail latency, walk-forward gate (OOS Sharpe ≥ 0.5, positive OOS return, DD ≤ 25%, ≥5 trades,
≥50% positive folds). All candidates are evaluated as **timing/regime overlays on long-only
exposure**, not long-short factors — most academic crypto factor evidence is long-short, and that
inflates expectations if read naively.*

A structural note that applies to everything below: at 15–25 bps taker, a round trip costs ~0.3–0.5%. Any signal that fires more than a few times a month is fee-dead on arrival. Every viable candidate here is a **slow regime signal** (holding periods of weeks to months) — which also means each walk-forward fold will contain few trades, so the ≥5-trades gate requirement forces long folds (1y+) and multi-year data.

---

## 1. Perpetual funding rates as a spot-timing signal

### (a) Evidence quality: MODERATE for extremes, WEAK for continuous timing

- **Presto Research** ran the exact test that matters: OLS of funding-rate changes vs. BTC price changes on Binance data. Contemporaneous 7-day correlation is real (R² ≈ 0.125, p ≈ 1.9e-115) but **forward-looking single-asset prediction at T+1 is zero** — "the model has no prediction power." Cross-sectional (long low-funding / short high-funding across 50 pairs) worked in their backtest but with "extremely high" turnover — and it's long-short, so not implementable on Alpaca. ([Presto Research](https://www.prestolabs.io/research/can-funding-rate-predict-price-change))
- Academic support exists for funding as a **carry/positioning premium**, not a directional forecast: cross-sectional crypto carry earns ~43% ann. with Sharpe 0.74 long-short ([Fan, Jiao, Lu & Tong, SSRN 4666425](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4666425)); the carry premium is mostly the funding leg itself ([Cryptocurrency as an Investable Asset Class, arXiv](https://arxiv.org/pdf/2510.14435)); perpetual pricing theory in [Ackerer, Hugonnier & Jermann](https://finance.wharton.upenn.edu/~jermann/AHJ-main-10.pdf) and [no-arbitrage work](https://arxiv.org/pdf/2506.08573). None of this says funding *times spot direction*.
- Practitioner consensus: extreme funding marks positioning extremes — deeply negative funding has coincided with major bottoms (e.g., FTX collapse Nov 2022), sustained high positive funding precedes liquidation cascades — but "strong trends can sustain extreme funding for weeks without reversing." ([Bitget guide](https://www.bitget.com/academy/12560603880561), [QuantJourney](https://quantjourney.substack.com/p/funding-rates-in-crypto-the-hidden), [Zipmex](https://zipmex.com/blog/how-to-analyze-funding-rates-in-crypto/))

Honest read: the continuous signal is dead for time-series use. The only defensible long-only hypothesis is **tail-event contrarian/derisk**: (i) percentile-extreme negative funding → add/hold long exposure; (ii) percentile-extreme positive funding sustained N days → reduce exposure. These events are rare (a handful per year), which is both the strength (positioning extremes are the one regime where the mechanism — forced liquidation flows — is real) and the weakness (tiny sample, gate's ≥5 trades needs the derisk leg to also count as position changes).

### (b) Realistic net Sharpe (long-only spot overlay)
As an overlay on buy-and-hold BTC/ETH: plausibly lifts risk-adjusted return by cutting the worst leverage-flush drawdowns; expect **OOS Sharpe ~0.3–0.6 for the combined position, not clearly above vol-targeted buy-and-hold**. Do not expect the 0.74 carry Sharpe — that's long-short carry income you cannot collect.

### (c) Data / integration (free, verified)
- **Binance USDT-perp funding history — free, no key, verified working**: `GET https://fapi.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT` (8-hourly, paginate 1000/request, history back to Sept 2019). Same for ETHUSDT, SOLUSDT, LTCUSDT.
- Bybit/OKX offer equivalent free endpoints for cross-exchange confirmation; Coinglass aggregates but its API is paid.
- ~6.5 years of history × 3 values/day = ample for walk-forward.

### (d) Implementation shape
Daily bar close: compute trailing 30d rolling percentile of the 3-observation daily mean funding rate. Rules like: exposure = 1 baseline; → 0 (or 0.5) when funding > 95th percentile for ≥3 consecutive days; → 1 (re-risk/confirm long) when funding < 5th percentile. One parameter family, run through `scripts/sweep.py` / walk-forward gate as-is. Signal is exchange-derivatives data, genuinely non-price for the spot book — though funding correlates with recent returns, so **check incremental value over a plain momentum/vol filter** (it may just be momentum in a hat).

### (e) Failure modes
- Funding extremes are correlated with volatility extremes — the overlay may replicate the vol-targeting result already found (Sharpe-neutral).
- Regime dependence: pre-2021 funding behavior differs from the post-ETF era (structurally lower, arbitraged funding — [BitMEX derivatives report](https://www.bitmex.com/blog/2025q3-derivatives-report)); signal thresholds calibrated on 2020–2022 blowoffs may never fire again.
- Very few events → wide confidence intervals; a single lucky FTX-type call can carry the whole backtest (inspect fold attribution).
- Binance excludes US persons from perps but the *data* is public — no compliance issue for signal use.

---

## 2. On-chain metrics (MVRV, exchange flows, active addresses)

### (a) Evidence quality: MODERATE for slow valuation bands (MVRV), WEAK-TO-MIRAGE for flows/addresses

- The best recent evidence: a 2026 peer-reviewed study ([ScienceDirect, "Using on-chain data to predict Bitcoin cycles"](https://www.sciencedirect.com/science/article/pii/S0275531926002138)) tests rule-based NUPL, MVRV Z-score, and CVDD strategies over Dec 2013–Apr 2025 (three full cycles). MVRV strategies beat buy-and-hold on annualized return and Sharpe with statistically significant differences. Caveat: three cycles ≈ **three independent observations** of the cycle signal; threshold rules (e.g., "buy MVRV<1, sell >3.5") were known folklore before the sample ended, so the study is partly in-sample by construction.
- The cautionary tale is stock-to-flow: **S2F fails formal out-of-sample testing and doesn't beat a naive random walk at 1–6 month horizons** — the canonical on-chain data-mined mirage. (Same 2026 synthesis literature; see also [checkonchain](https://charts.checkonchain.com/) for how many such indicators exist to mine.)
- Exchange flows / active addresses: mostly practitioner narrative ("outflows = accumulation"), no credible OOS academic support found; flow metrics also suffer severe measurement problems (exchange wallet labeling changes retroactively — history gets rewritten, a lookahead bias you cannot fix). Treat as **low priority**.

### (b) Realistic net Sharpe
An MVRV-band regime filter on long-only BTC (in when cheap/neutral, out or reduced when MVRV Z > extreme) plausibly achieves **OOS Sharpe 0.5–0.9 with drastically reduced drawdown** — it's the one on-chain signal whose mechanism (aggregate cost basis / realized cap) is economically interpretable and slow enough to survive fees. But statistical confidence is inherently low: you get ~1 signal pair per cycle. It's better framed as **drawdown control that doesn't kill Sharpe** (unlike vol targeting) than as alpha.

### (c) Data / integration (free, verified)
- **Coin Metrics Community API — free, no key, verified working**: `https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=CapMVRVCur,AdrActCnt,FlowInExUSD,FlowOutExUSD&frequency=1d` — confirmed `CapMVRVCur`, `AdrActCnt`, `FlowInExUSD/FlowOutExUSD`, `SplyCur`, `CapMrktCurUSD` are live for BTC with daily data current to yesterday, history to 2010s. Rate limit 10 req/6s; CC non-commercial license (fine for research; check before live-trading commercially). ([docs](https://gitbook-docs.coinmetrics.io/packages/coin-metrics-community-data))
- Glassnode: Advanced ~$49/mo **without real API** (API needs Professional ~$999/mo + add-on) — not worth it; Coin Metrics community covers the needed metrics. ([Glassnode pricing](https://studio.glassnode.com/pricing), [review](https://captainaltcoin.com/glassnode-review/))
- CryptoQuant: free tier exists for evaluation but API-heavy use needs paid tiers ([pricing](https://cryptoquant.com/pricing)); blockchain.info charts API is free for basic BTC network stats.

### (d) Implementation shape
Daily regime filter: exposure 1.0 when MVRV (or MVRV Z-score computed from CapMVRVCur + rolling stats) below upper band, 0–0.5 above; optionally 1.0 forced-in below lower band. Two thresholds max — resist the urge to add NUPL/CVDD/SOPR variants (that's the multiple-testing trap; each extra indicator ≈ another N in the deflated-Sharpe correction). Trades ~2–6 per fold only if folds are ≥2 years.

### (e) Failure modes
- **Cycle non-stationarity**: MVRV extremes compress each cycle (2021 top ~3.9 vs 2017 ~4.7 vs 2013 ~6); post-ETF institutional era may not revisit historical bands at all — a threshold strategy can stay 100% invested into a top or sit out a whole bull market.
- Realized-cap methodology differences across providers → signal values differ; pin to one provider and version.
- Very few independent events; a walk-forward "pass" is closer to anecdote than for fast signals. Log this explicitly in the experiment file.
- Exchange-flow metrics: retroactive wallet-label revisions = unfixable lookahead bias. Recommend excluding.

---

## 3. Stablecoin supply growth / crypto breadth as regime filters

### (a) Evidence quality: WEAK-TO-MODERATE, with a serious reverse-causality problem

- Event studies find stablecoin issuances/transfers produce **short-term positive abnormal BTC returns and volume** ([Technological Forecasting & Social Change](https://www.sciencedirect.com/science/article/abs/pii/S0040162521002833)), and Tether minting/burning has significant asymmetric effects on BTC returns ([VAR study, AJMSS](https://drpress.org/ojs/index.php/ajmss/article/download/32611/31915)).
- But the same VAR literature finds **issuance largely reacts to prior price moves, with weak net spillover once contemporaneous correlation is controlled** — i.e., supply growth may be a lagging demand thermometer, not a leading signal. Practitioner pieces claiming "stablecoin supply spikes precede BTC upside" ([Bitcoin Magazine](https://bitcoinmagazine.com/markets/3-signals-predict-bitcoin-big-move), [Coinbase Institutional](https://www.coinbase.com/institutional/research-insights/research/market-intelligence/new-framework-for-stablecoin-growth)) do not present OOS tests.
- Crypto breadth (% of top-N coins above 200d MA) is pure practitioner territory ([MacroMicro chart](https://en.macromicro.me/charts/138282/crypto-percentage-above-the-200day-moving-average), [Stage Analysis](https://www.stageanalysis.net/blog/326402/crypto-breadth-percentage-of-crypto-coins-above-short-medium-long-term-moving-averages)) — no formal evidence found. Note honestly: **breadth is a price-derived signal** (of the aggregate market, not the traded asset), so it only half-qualifies as "non-price information"; it's adjacent to the exhausted TA track.

### (b) Realistic net Sharpe
Stablecoin-growth regime filter on long-only BTC/ETH: **OOS Sharpe ~0.3–0.5, high variance of estimate**. Its plausible value, like MVRV, is avoiding the deep-bear regime (stablecoin supply contracted through 2022) rather than adding return. Breadth filter: expect it to behave like a lagged trend filter — probably fails the gate for the same reason the TA track did.

### (c) Data / integration (free, verified)
- **DefiLlama stablecoins API — free, no key, verified working**: `https://stablecoins.llama.fi/stablecoincharts/all` — daily aggregate stablecoin circulating supply history back to 2017 (confirmed the endpoint returns data from Nov 2017). Per-coin (USDT/USDC) also available.
- Breadth: computable from free CoinGecko/Alpaca daily closes for a fixed top-N universe (mind survivorship — fix the universe per fold-start date).

### (d) Implementation shape
Monthly-ish regime: 30d (or 90d) % change in aggregate stablecoin supply > 0 → risk-on (full BTC/ETH exposure); contracting → risk-off/half. One parameter (lookback). Combines naturally as an AND/OR gate with the MVRV filter — but test each alone first (one variable at a time, per conventions).

### (e) Failure modes
- **Reverse causality / regime break**: post-GENIUS-Act-era stablecoin growth is increasingly driven by payments/RWA adoption, not crypto-trading dry powder — the historical correlation to BTC may already be decoupling (the 2025–26 divergence of supply-up/BTC-flat is visible in current data).
- Single-history problem: one time series, one 2022 bear to "predict" — effectively 1–2 independent regime events.
- USDT dominance shifts (USDC collapse Mar 2023, USDT-on-Tron growth) distort aggregate growth for reasons unrelated to risk appetite.

---

## 4. Bitcoin ETF flows (IBIT et al.)

### (a) Evidence quality: MODERATE statistically, but SHORT SAMPLE and contested direction

- Best study: [Lim, "The Price Impact of Spot Bitcoin ETF Flows" (SSRN 6592830)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6592830) — Jan 2024–Apr 2025 daily net flows across the 5 largest ETFs: $100M net flow ↔ ~53 bps same-day BTC return (OLS; 74 bps IV), flows explain ~21% of daily return variance, and **flows predict next-day returns**, with an explicit bidirectional feedback loop (returns also cause subsequent flows). See also [Mazur & Polyzos (SSRN 5452994)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5452994) and cointegration of ETF AUM with price ([Ledger journal](https://www.ledgerjournal.org/ojs/ledger/article/view/393), [Economics Letters](https://www.sciencedirect.com/science/article/pii/S0165176525001417)).
- Practitioner consensus is more skeptical: "flows confirm direction already underway"; multi-day streaks (≥5 consecutive outflow days) carry more signal than single days ([Phemex](https://phemex.com/academy/bitcoin-etf-flows-explained), [KuCoin](https://www.kucoin.com/blog/how-bitcoin-etf-inflows-and-outflows-impact-btc-price-in-2026)).
- Critical timing caveat the academic result glosses over: daily flow numbers are published **evening/next-morning after the close** (creations settle T+1), so the tradeable version is "yesterday's flows → today's position," which is exactly the momentum-confirming version — and flows are themselves caused by past returns, so much of the "signal" may be return autocorrelation already tested and killed.

### (b) Realistic net Sharpe
Flow-streak overlay on long-only BTC: **OOS Sharpe ~0.3–0.6, with very high model risk** — only ~2.5 years of data (one structural regime), no bear market in sample until 2025-26 softness, and heavy overlap with simple momentum. This one cannot honestly clear a multi-fold walk-forward yet; the data is too young for the gate to mean anything (2–3 folds max).

### (c) Data / integration
- [Farside Investors](https://farside.co.uk/bitcoin-etf-flow-all-data/) — full daily per-fund table since Jan 2024, free but **Cloudflare-protected** (direct curl gets challenged); needs a headless fetch or manual CSV, or third-party wrappers ([Parse](https://parse.bot/marketplace/d1af202b-4969-4869-bcf2-d16d71525d36/farside-co-uk-api), [Apify](https://apify.com/gochujang/crypto-etf-flow-tracker/api)).
- [SoSoValue dashboard](https://sosovalue.com/shares/Gwae) offers downloadable history; [CoinGlass ETF page](https://www.coinglass.com/etf/bitcoin) and [bitbo](https://bitbo.io/treasuries/etf-flows/) as cross-checks.

### (d) Implementation shape
Daily: position = f(sign and streak-length of trailing 3–5 day aggregate net flow), executed next open. Cheap to build, but recommend **paper-only observation track**, not a gated candidate, until ≥4 years of data exist.

### (e) Failure modes
Short sample / single regime; publication lag; flows ≈ lagged returns (test incremental value vs. 5-day momentum — if none, kill it); basis-trade contamination (a chunk of IBIT flow is hedged cash-and-carry arb, not directional demand — those flows carry no signal); source-scraping fragility.

---

## Realism / base rates (read this before believing any backtest)

**What Sharpe is realistically achievable retail, daily bars?**
- Robert Carver (ex-AHL, the canonical reference for exactly this situation): a single instrument/rule realistically caps around **SR ~0.40 pre-diversification**; a small undiversified portfolio ~0.2; his own ~45-instrument diversified futures system backtests ~1.0 after costs and he *discounts that to ~0.75* for live expectations. Retail systematic SR "rarely exceeds 1.0." ([Systematic Trading summary](https://the7circles.uk/systematic-trading-1-theory/), [review](https://tradermarkus.com/robert-carver-systematic-trading-review/), [thread](https://threadreaderapp.com/thread/1234306875379683328.html))
- Implication: **the gate (OOS Sharpe ≥ 0.5) is well-calibrated** — demanding OOS 1.5+ from a long-only single-asset crypto overlay would be demanding evidence of being world-class. Conversely, any backtest showing Sharpe > 1.5 on one asset should be treated as a bug or overfit until proven otherwise.

**Do backtests survive live?**
- Quantopian's cohort study of **888 real algorithms**: backtest Sharpe predicts out-of-sample Sharpe with **R² < 0.025** — essentially uninformative; and the more a quant backtested, the bigger the live shortfall (direct evidence of overfitting-by-iteration). ([Wiecki et al., SSRN 2745220](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2745220), [QuantPedia summary](https://quantpedia.com/quantopians-academic-paper-about-in-vs-out-of-sample-performance-of-trading-alg/))
- McLean & Pontiff (Journal of Finance): published anomaly returns are **26% lower out-of-sample, 58% lower post-publication**. Any signal you read about in a paper or blog is already substantially arbitraged. ([SSRN 2156623](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2156623))
- Rule of thumb the field converges on: **halve the backtest Sharpe, double the backtest drawdown** for live expectations.

**Multiple testing**
- Bailey & López de Prado's **Deflated Sharpe Ratio**: with N=200 trials, an apparent annual SR of 0.75 deflates to ~0.32. Every sweep configuration in `scripts/sweep.py` is a trial. ([SSRN 2460551](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2460551), [PDF](https://www.davidhbailey.com/dhbpapers/deflated-sharpe.pdf))
- Harvey, Liu & Zhu: given the field's mined-factor count, a new "discovery" needs **t ≥ 3.0**, not 2.0 ([Harvey & Liu, Backtesting](https://people.duke.edu/~charvey/Research/Published_Papers/P120_Backtesting.PDF)). For our harness: 5 candidates × ~20 param combos each ≈ 100 trials per cycle — a single gate pass at nominal p≈0.05 is *expected by luck*. Consider adding a deflated-Sharpe or trial-count field to experiment entries.

**Which strategy classes actually persist (and suit capacity-unconstrained small traders)?**
1. **Time-series momentum / trend following, 3–12 month horizon** — the single best-documented premium: positive in every decade since 1880 across 67 markets, robust across asset classes including crypto in academic panels. ([Hurst, Ooi & Pedersen, "A Century of Evidence"](https://fairmodel.econ.yale.edu/ec439/hurst.pdf), [Alpha Architect refresh](https://alphaarchitect.com/time-series-momentum-aka-trend-following-the-historical-evidence/)). Caveat: short-term trend has degraded ([microstructure account, arXiv](https://arxiv.org/html/2607.01550)); the persistent version is *slow* trend — close to what the crypto TA track tested and rejected on Sharpe-after-drawdown grounds; the honest reconciliation is that slow trend works *cross-asset diversified*, not on 1–4 correlated crypto majors.
2. **Carry** (funding, basis) — strong evidence, but the crypto version needs shorting perps: not available on Alpaca.
3. **Cross-sectional momentum/trend in crypto** — academic support ([CTREND, JFQA](https://www.cambridge.org/core/journals/journal-of-financial-and-quantitative-analysis/article/trend-factor-for-the-cross-section-of-cryptocurrency-returns/4C1509ACBA33D5DCAF0AC24379148178)), but long-short; a long-only top-K rotation among Alpaca's ~20 spot coins is the implementable residual and inherits crypto beta drawdowns.
4. **Where small size is the edge**: less-liquid corners, faster rebalancing than institutions can do, and holding assets/strategies too small for funds. Nothing in this report exploits that except possibly rotation among smaller Alpaca-listed alts — noted as a future direction, not a validated one.

**The uncomfortable base-rate conclusion for this repo**: given (i) long-only spot constraint, (ii) 15–25 bps fees, (iii) one asset class of highly correlated majors, the realistic *ceiling* for OOS Sharpe of any single overlay here is ~0.5–0.8, and the modal outcome of each experiment below is a fail. That is consistent with the five cycles to date and is what honest research looks like.

---

## Ranked shortlist

| Rank | Candidate | Why this rank | Expected gate outcome |
|---|---|---|---|
| 1 | **MVRV regime filter on long-only BTC (Coin Metrics `CapMVRVCur`, free, verified)** | Only non-price signal with peer-reviewed multi-cycle evidence of beating buy-and-hold Sharpe *and* it attacks the exact killer (45–78% drawdowns) without vol-targeting's Sharpe cost. Slow → fee-proof. | Plausible pass, but treat a pass as low-confidence (≈3 independent cycle events); require the DD ≤ 25% leg to be the headline result |
| 2 | **Funding-rate extreme derisk/contrarian overlay (Binance fapi, free, verified)** | Genuinely different information source (derivatives positioning), real mechanism at extremes, 6.5y of 8-hourly data supports proper walk-forward. But T+1 continuous predictive power is provably ~zero — only the tail version can work. | Coin-flip; must beat vol-targeted baseline, not just buy-and-hold, to count |
| 3 | **Stablecoin supply growth regime filter (DefiLlama, free, verified)** | Free, 8+ years of data, plausible dry-powder mechanism — but serious reverse-causality evidence and a likely structural decoupling in the payments-stablecoin era. | Likely fail or fragile pass; worth one cheap cycle since data is a single curl |
| 4 | **ETF flow streaks** | Best per-observation statistics (flows predict next-day returns, SSRN) but only ~2.5y of data = 2–3 folds; heavily confounded with momentum; scraping-fragile source. | Cannot honestly gate yet — build the data pipe, observe on paper, revisit 2027 |
| 5 | **Exchange flows / active addresses / crypto breadth** | Flows: retroactive-labeling lookahead bias is unfixable. Addresses: no credible OOS evidence. Breadth: price-derived, adjacent to the exhausted TA track. | Recommend not spending a cycle |

**Cross-cutting recommendations for the harness**: (1) every candidate must be benchmarked against *vol-targeted* buy-and-hold, not raw buy-and-hold, or you'll rediscover vol-targeting in disguise; (2) record trial counts per cycle and apply a deflated-Sharpe sanity check before declaring any pass; (3) for slow signals, lengthen folds so ≥5 trades is achievable without inviting parameter-jitter — and count "exposure changes," not round trips, as trades; (4) pin data-provider and metric version in the experiment log, since on-chain histories get revised.
