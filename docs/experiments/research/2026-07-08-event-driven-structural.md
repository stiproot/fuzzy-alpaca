# Research: event-driven, calendar/structural, and relative-value edges (2026-07-08)

*One of four parallel research reports feeding [the backlog](../backlog.md). Judged against the
fuzzy-alpaca gate (OOS Sharpe ≥ 0.5, positive OOS return, max DD ≤ 25%, ≥5 trades, ≥50% positive
folds), Alpaca execution (commission-free equities, MOO/MOC achievable, long/short equities,
long-only spot crypto), daily-bar walk-forward harness.*

---

## 1. Overnight vs Intraday Return Anomaly (hold overnight, flat intraday)

### (a) Evidence quality
**Gross evidence: very strong. Net evidence: weak-to-negative.** The gross effect is one of the best-documented anomalies: nearly all of the S&P 500's return since 1995 accrued close-to-open; individual-stock long-short overnight portfolios earned ~38%/yr gross with extreme Sharpe ([Elm Wealth, "Night Moves"](https://elmwealth.com/night-moves-overnight-drift/); [Lachance 2023, Review of Financial Economics](https://onlinelibrary.wiley.com/doi/full/10.1002/rfe.1180); [NY Fed staff report on the overnight drift in ES futures](https://www.newyorkfed.org/medialibrary/media/research/staff_reports/sr917.pdf); [Polk et al., "Tug of War"](https://personal.lse.ac.uk/polk/research/TugOfWar.pdf)). Recent ETF-level data (Q3 2020–Q3 2025) still shows overnight > intraday for SPY/QQQ, with overnight returns lower-vol and positively skewed vs. flat/negative intraday for growth indices ([Vatsal Pandya 2025](https://www.vatsalpandya.com/blog/overnight-returns-stock-market-anomaly); [Cacciatore, Medium](https://medium.com/@ejcacciatore/a-dissection-of-market-returns-the-overnight-anomaly-and-the-call-for-a-24-5-rhythm-995309847fea)).

But net of costs the story collapses:
- Alpha Architect's review of the cost literature concludes trading costs wipe out the anomaly; outperformance survives only in narrow post-event windows and with low statistical robustness ([Alpha Architect](https://alphaarchitect.com/trading-costs-wipe-out-the-overnight-return-anomaly/)).
- Elm Wealth's own numbers: 1bp round-trip costs cut ~5%/yr; historical 10bp commissions would have eliminated all profit; their advice to retail is "trade less," not "trade the close" ([Elm Wealth](https://elmwealth.com/night-moves-overnight-drift/)).
- **The decisive real-world experiment already ran and failed**: NightShares NSPY/NIWM ETFs (long S&P 500 / Russell 2000 overnight only) launched June 2022, returned −6.9% vs +22% for the S&P 500, and liquidated August 2023 — trading costs exceeded the night effect ([Bloomberg](https://www.bloomberg.com/news/articles/2023-07-19/-night-effect-funds-to-shut-down-with-overnight-returns-elusive); [etf.com](https://www.etf.com/sections/news/2-nightshares-etfs-close-after-struggling-gain-traction); [ETF Stream](https://www.etfstream.com/articles/blackout-for-night-effect-etfs)).

### (b) Realistic net OOS Sharpe today
Single-ETF (SPY/QQQ) overnight-only at small retail size using auction orders (no spread crossed, commission-free): **~0.0–0.3**. The individual-stock long-short version (short high-attention names overnight) is gross-attractive but requires shorting hard-to-borrow names daily — net negative at retail. Note the strategy also does 2 trades/day = ~500 round trips/yr, so even 1–2bp of auction slippage per side is 5–10%/yr of drag.

### (c) Data/integration needed
**Nothing new** — daily bars' open and close from Alpaca are sufficient (overnight return = today's open / yesterday's close). Two MOC/MOO-equivalent orders per day; Alpaca supports market-on-open/close timing at retail latency. This is the cheapest experiment on this list.

### (d) Implementation shape
Buy SPY/QQQ (or a small high-beta ETF basket) at close, sell at next open, flat intraday. Variants: weekend-only (the effect is ~1.5x stronger over weekends per Elm Wealth); post-earnings overnight holds only (the one net-of-cost survivor per Alpha Architect). Backtest is exactly representable in a daily-bar harness using open and close columns.

### (e) Failure modes / tail risks
- Slippage at the open auction is systematically adverse for this trade (you sell into the very open where retail attention-buying peaks).
- ~500 turnovers/yr amplifies any per-trade cost; the NSPY liquidation is direct evidence a professional implementation couldn't clear costs.
- Anomaly's cause (retail attention at open, market-maker inventory) is being arbitraged by 24h trading expansion; effect is weakening ([Cambridge JFQA, "Paying Attention"](https://www.cambridge.org/core/journals/journal-of-financial-and-quantitative-analysis/article/abs/paying-attention-overnight-returns-and-the-hidden-cost-of-buying-at-the-open/F9AAD159B512C651F09D5D52011D88E0)).
- All the downside gaps (overnight crashes) are held; drawdowns are gap risk you cannot stop out of.

---

## 2. Index Rebalancing / S&P Inclusion-Deletion Effects

### (a) Evidence quality
**Strong evidence that the classic effect died; credible but thin evidence of a retail-driven partial revival.** Greenwood & Sammon (HBS/NBER) document the index effect going from −16.1% (deletions, 1990s) to −0.6% and statistically zero in 2010–2020; additions similarly compressed ([NBER w30748](https://www.nber.org/system/files/working_papers/w30748/w30748.pdf); [Alpha Architect summary](https://alphaarchitect.com/disappearing-index-effect/); [Klement](https://klementoninvesting.substack.com/p/the-index-inclusion-effect-is-dead); [Morningstar](https://www.morningstar.com/funds/index-inclusion-effect-isnt-cause-concern)). Post-2020, retail flows revived an **announcement-day pop**: 2025 S&P 500 additions (Block, Coinbase, DoorDash era names) outperformed the equal-weight index by ~7.4pp on announcement day ([ETF Trends](https://www.etftrends.com/retail-revival-fuels-comeback-sp-500-index-inclusion-effect/)). The **deletion effect** (buying discretionary deletions and holding) is separately documented: deletions outperform by ~5%/yr for five years (Research Affiliates, basis for the NIXT ETF) ([Research Affiliates](https://www.researchaffiliates.com/publications/press-exclusive/1043-nixed-the-upside-of-getting-dumped); [AAII](https://www.aaii.com/journal/article/239750-the-sp-500-outcasts-picking-up-the-dropped-stocks)). Russell reconstitution liquidity-provision returns exist but are institutional-flavored and decaying ([Madhavan, FAJ 2003](https://www.hillsdaleinv.com/uploads/The_Russell_Reconstitution_Effect,_Ananth_Madhaven,_Financial_Analysts_Journal,_JulyAugust_2003,_Pages_51-64.pdf); [CME 2026](https://www.cmegroup.com/articles/2026/the-2026-russell-reconstitution.html)).

### (b) Realistic net OOS Sharpe
The announcement-day pop requires acting within minutes/hours of an after-hours press release — partially feasible (buy next open, hold to effective date), but the residual after the open gap is small and noisy. As an annualized standalone: **hard to estimate, likely 0–0.4 with very lumpy, low-N returns**. The deletion portfolio is a value tilt with a 5-year horizon — respectable but its Sharpe is that of a diversified value strategy (~0.3–0.5) with 25%+ drawdowns entirely possible.

### (c) Data/integration needed
S&P/Russell change announcements (S&P DJI press releases; free but must be scraped/monitored; **historical announcement-date datasets are not freely available in clean form** — this is the real blocker for backtesting). No free API provides point-in-time index membership changes with announcement timestamps; reconstructing them is manual work.

### (d) Implementation shape
Event portfolio: on announcement, long addition / short deletion at next open, exit at effective-date close (~5 trading days). Or the slow version: buy discretionary deletions, hold 1 year, quarterly refresh.

### (e) Failure modes / tail risks
- ~20–25 S&P 500 changes/yr → fails the "≥5 trades per fold / ≥50% positive folds" spirit of the gate; one Tesla-sized event dominates a year.
- The fast version's alpha lives in the minutes after announcement — retail latency captures little.
- Deletions are idiosyncratically risky single names (that's why they were deleted); shorting additions fights retail momentum.
- Crowding: the revival is *known* (published 2025); the historical pattern is that publication kills it (Greenwood-Sammon mechanism: standby institutional liquidity).
- **Poor fit for the harness**: event-time, not calendar-time; backtest data effectively unavailable for free.

---

## 3. Earnings-Announcement Effects at Daily Cadence

### (a) Evidence quality
**Mixed and actively disputed — the most academically contested item here.**
- **PEAD (post-earnings drift)**: Classic anomaly; declared dead in non-microcaps by ~2006 in one literature stream, then two 2025 papers claim it is alive again ([UCLA Anderson Review](https://anderson-review.ucla.edu/is-post-earnings-announcement-drift-a-thing-again/); [ScienceDirect 2024 PEAD strategy paper](https://www.sciencedirect.com/science/article/abs/pii/S1057521924003922); [ML-revived PEAD, Finance Research Letters 2025](https://www.sciencedirect.com/science/article/abs/pii/S1544612325020057)). The cost critique is severe: PEAD concentrates in illiquid stocks (0.04%/mo value-weighted in the most liquid quintile vs 2.43%/mo in the least liquid), and transaction costs consume **63–100%** of paper profits ([Chordia, Goyal, Sadka, Sadka, Shivakumar](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1403342); [review](https://www.sciencedirect.com/science/article/pii/S2214635020303750)). Battalio & Mendenhall and others dissent, finding residual profit.
- **Earnings announcement premium (pre/at-announcement)**: long announcers earns 7–18%/yr excess, strong in *large caps*, persistent since 1927; ~71% of it accrues *before* the release, concentrated in high-uncertainty names ([Quantpedia](https://quantpedia.com/strategies/earnings-announcement-premium); [Quantpedia pre-announcement returns](https://quantpedia.medium.com/pre-announcement-returns-e5c1d8084c6c); [NBER w13090](https://www.nber.org/system/files/working_papers/w13090/w13090.pdf)).
- "Straddle-like" equity plays without options don't exist in a clean form — you can only trade direction on the surprise the day after (a 1-day-lag PEAD entry), which is the standard retail implementation.

### (b) Realistic net OOS Sharpe
Long/short surprise portfolio restricted to liquid large/mid caps, entered at next-day open after the announcement, held 5–60 days, diversified across many events per fold: **0.2–0.6 net**. The earnings-announcement premium (long-only, buy N days before confirmed announcement, exit after) in large caps: **0.3–0.6**, with the advantage of long-only large-cap liquidity. Both are honest maybes, not layups — the gate could plausibly pass or fail.

### (c) Data/integration needed (the real cost of this candidate)
- Earnings calendar (confirmed dates, timing before/after market): [Finnhub](https://finnhub.io/docs/api/earnings-calendar) (free tier; earnings surprises back to 2000), [Alpha Vantage](https://hexdocs.pm/alpha_vantage/AlphaVantage.FundamentalData.html) (free 25 req/day; quarterly EPS with estimate + surprise), [FMP](https://site.financialmodelingprep.com/developer/docs/stable/earnings-calendar) (free 250 req/day), [EODHD](https://eodhd.com/financial-apis/calendar-upcoming-earnings-ipos-and-splits) (cheap paid).
- **The trap: point-in-time consensus.** Free APIs give current-vintage estimates; historical surprise fields (actual vs estimate at the time) from Finnhub/Alpha Vantage are usable for backtests but their estimate vintage is not fully auditable. Mitigation: use *revenue/EPS actual vs prior consensus as reported by the API's historical surprise endpoint* and, better, define surprise by **announcement-day abnormal return** (price-based SUE proxy) — computable purely from daily bars + calendar, immune to estimate-vintage leakage.

### (d) Implementation shape
Daily-bar native: each day, from the earnings calendar, identify names that reported since yesterday's close; compute surprise (API surprise or day-0 abnormal return vs sector ETF); enter long top-decile / short bottom-decile at today's open; hold 20–60 days, overlapping portfolio; liquid universe (top ~500 by dollar volume). The premium variant: long names with confirmed announcements in the next 1–10 days, exit day after report.

### (e) Failure modes / tail risks
- The drift that survives costs may be exactly in the illiquid names you must exclude — you may be left with the 0.04%/mo liquid-quintile residue.
- Estimate-data leakage silently inflates backtests (the classic PEAD backtest sin).
- Short leg carries borrow fees and squeeze risk in heavily-shorted post-miss names.
- Crowding: earnings factors are core to every quant shop; the announcement-day move is increasingly instantaneous (drift compresses into the gap you can't capture).
- Single-name gap risk both ways; needs 20+ concurrent positions to be gate-shaped.

---

## 4. ETF/Stock Pairs Trading & Daily Stat-Arb

### (a) Evidence quality
**Strong evidence the classic version is dead; surviving claims are suspect.** Gatev et al. (1962–2002) profits decayed within sample; Do & Faff show the distance method **unprofitable after 2002 once time-varying costs are included** ([Do & Faff via ResearchGate](https://www.researchgate.net/publication/228259167_Are_Pairs_Trading_Profits_Robust_to_Trading_Costs); [Yale Zhu 2024, "Examining Pairs Trading Profitability"](https://economics.yale.edu/sites/default/files/2024-05/Zhu_Pairs_Trading.pdf)). What "still works" in recent literature is adaptive/copula/ML variants — i.e., in-sample-flexible methods with high overfitting risk ([Harbourfront overview](https://harbourfrontquant.substack.com/p/modern-pairs-trading-what-still-works)). A 2025 Springer paper on cointegrated ETF pairs claims ~15%/yr, Sharpe 1.43 after costs for country ETFs ([Journal of Asset Management](https://link.springer.com/article/10.1057/s41260-025-00416-0)) — treat as optimistic: academic cost assumptions, no borrow fees on inverse legs, and cointegration instability is the paper's own headline caveat. Quantpedia's country-ETF pairs strategy shows substantial live decay ([Quantpedia](https://quantpedia.com/strategies/pairs-trading-with-country-etfs)).
- **GOOG/GOOGL share classes**: spread typically <1% and mean-reverting; an OU-model academic study claims Sharpe >5 ([SAJBM](https://sajbm.org/index.php/sajbm/article/view/4850/3419)) — but that is on the *spread process* pre-cost; the practical edge is basis points per trade (a documented live example: 0.92% on $1k over a multi-week convergence) ([DataDrivenInvestor](https://www.datadriveninvestor.com/2022/11/10/dual-class-arbitrage-is-a-literal-cash-cow/)). Dual-listed classics (RDS A/B etc.) have mostly been collapsed by issuers.

### (b) Realistic net OOS Sharpe
Sector-ETF cointegration pairs at retail daily cadence: **0–0.4 net** (costs, borrow on the short ETF leg, regime breaks). GOOG/GOOGL: high hit-rate but **tiny per-trade edge (~10–50bp per convergence, few signals/yr at daily granularity)** — likely passes on Sharpe *sign* but marginal on magnitude and trade count; capacity irrelevant at our size, edge is the problem, not capacity.

### (c) Data/integration needed
None beyond existing daily bars (pairs universe = sector/country ETFs + GOOG/GOOGL). Short availability/borrow rates on ETFs via Alpaca (easy for liquid sector ETFs). Zero new data integration — cheap to test.

### (d) Implementation shape
Rolling cointegration (Engle-Granger/Johansen) on 1–2y windows over a fixed ETF universe; z-score of spread; enter at |z|>2, exit at 0, stop at |z|>3.5 or cointegration break; dollar-neutral. GOOG/GOOGL: fixed pair, z-score on the ratio, long cheap/short rich.

### (e) Failure modes / tail risks
- Cointegration breaks are the tail: the spread trends instead of reverting (sector regime shifts, index reconstitutions), and stops crystallize losses repeatedly — the "picking up nickels" profile.
- This is the *same statistical family* as the mean-reversion TA already exhausted at OOS Sharpe ~0.43 in this repo — a spread of two prices is still price/volume data; expect the same ceiling.
- Do & Faff's post-2002 verdict is the base rate; modern "it works" papers are mostly flexible-model in-sample results.

---

## 5. Cross-Asset Lead-Lag at Daily Horizon

### (a) Evidence quality
**Weakest of the six.**
- Credit spreads → equities: useful only when the stress is credit-driven (2007–08, 2015–16 energy); failed for 2020, 2022, 2024 drawdowns; practitioners use it only as one input in multi-factor risk dashboards ([SystemTrader HYG/LQD tracker](https://www.systemtrader.co/tools/credit-spreads)).
- VIX futures → SPX: lagged VIX futures changes have *some* predictive power over SPX returns in academic tests, but economic significance at daily horizon post-costs is unestablished ([AUT working paper](https://acfr.aut.ac.nz/__data/assets/pdf_file/0010/544519/VIX_leadlag-2.pdf)).
- VIX term-structure slope as an *equity regime filter* is better supported (see §6) — as a conditioning variable, not a standalone signal ([Macrosynergy](https://macrosynergy.com/research/vix-term-structure-as-a-trading-signal/)).
- Equity → next-day crypto: BTC-SPX correlation is high and regime-dependent (30-day rolling ~0.74 in early 2026) but rigorous evidence of *exploitable next-day lead-lag* is thin; NYSE hours lead bitcoin *activity*, and BTC time-of-day/weekend seasonalities exist but are unstable across exchanges and periods ([Investing.com risk piece](https://www.investing.com/analysis/bitcoin-vs-sp-500--risk-reassessment-into-2026-200673050); [ScienceDirect Bitcoin day-of-week](https://www.sciencedirect.com/science/article/abs/pii/S1544612317307894); [ScienceDirect time-of-day](https://www.sciencedirect.com/science/article/abs/pii/S1544612319301710); [Quantpedia overnight seasonality in Bitcoin](https://quantpedia.com/strategies/intraday-seasonality-in-bitcoin); [papers with backtest BTC seasonality](https://blog.paperswithbacktest.com/p/bitcoin-never-sleeps-exploiting-seasonality)).

### (b) Realistic net OOS Sharpe
Standalone daily lead-lag strategies: **~0–0.3, with high regime fragility**. As an **overlay** (e.g., HY-OAS z-score or VIX3M/VIX gating the existing equity mean-reversion sleeve, or gating crypto long exposure by prior-day SPX return): potentially worth +0.1–0.2 Sharpe on an existing strategy — that's the honest use.

### (c) Data/integration needed
All free: FRED (HY OAS `BAMLH0A0HYM2`, 10y yields), CBOE (VIX, VIX3M, VIX9D daily CSV), Yahoo/Stooq for indices. One small ingest script; daily frequency; no point-in-time issues (these series aren't revised meaningfully).

### (d) Implementation shape
Feature columns joined to the existing daily-bar harness: ΔHY-OAS z-score, VIX3M/VIX ratio, prior-day SPX return → binary regime gates or position scalars on existing sleeves (equities and the long-only crypto sleeve).

### (e) Failure modes / tail risks
- Massive multiple-testing surface (many series × many lags × many thresholds) — exactly the environment where the repo's gate exists to kill mirages; test at most 1–2 pre-registered hypotheses.
- Lead-lag relations are regime artifacts; the 2020–2022 BTC-SPX coupling was a liquidity regime, already loosening.
- Signals are slow-moving → few independent bets → wide Sharpe confidence intervals; folds will disagree.

---

## 6. Volatility Risk Premium Without Options (VIX-Futures ETPs)

### (a) Evidence quality
**Best-documented structural premium on this list.** VIX futures sit in contango ~80% of the time; the roll-down is a persistent, economically-motivated risk premium (insurance selling), not a statistical artifact ([Cboe term structure](https://www.cboe.com/tradable-products/vix/term-structure/); [Volatility Box](https://volatilitybox.com/research/vix-contango-backwardation/)). Term-structure slope is "among the most robust signals in the literature" for timing vol exposure ([Macrosynergy](https://macrosynergy.com/research/vix-term-structure-as-a-trading-signal/)). Quantpedia's implementations of term-structure-filtered VIX ETP strategies show Sharpe ~0.60–0.63; academic versions report a short-futures investor who de-risks into cash on backwardation earning ~3.4%/mo four-factor alpha, Sharpe 0.36 ([Quantpedia](https://quantpedia.com/strategies/exploiting-term-structure-of-vix-futures)). Caveats are real: some out-of-sample extensions show alpha deterioration, and the basis's predictive power has been dropping since 2018 ([QuantConnect replication thread](https://www.quantconnect.com/forum/discussion/14629/trading-strategies-based-on-vix-term-structure-research-paper-backtest/); [Vol Vibes](https://volvibes.substack.com/p/vix-futures-and-volatility-etps) noting 2024 was poor for vol ETPs despite SPX +20%). Tail evidence is unambiguous: XIV lost ~96% in one session on Feb 5, 2018 ("Volmageddon"); SVXY (now −0.5x) lost ~50% in two weeks in March 2020; August 2024 produced another VIX spike event ([TradingSim](https://www.tradingsim.com/blog/mastering-the-art-of-shorting-the-vix-strategies-for-volatility-trading); [Volatility Box ETP guide](https://volatilitybox.com/research/vix-etfs-explained/)).

### (b) Realistic net OOS Sharpe
Term-structure-timed short-vol via ETPs (long SVXY when VIX3M/VIX > threshold, flat or long VIXY when inverted), vol-targeted: **0.4–0.8 net** — genuinely straddles our gate. Costs are low (SVXY/VIXY are liquid ETFs, no borrow needed if long-inverse rather than short-VXX; ~0.9–1.4% expense ratios internalized). Sharpe is size-invariant; the DD gate is what drives sizing (see (d)).

### (c) Data/integration needed
All free and daily: VIX and VIX3M index closes (CBOE daily CSVs / Yahoo `^VIX`, `^VIX3M`); optionally VX front/second futures settle from CBOE for a true basis measure ([vixcentral](https://vixcentral.com/) for eyeballing). Instruments: SVXY, VIXY, (VXX if shorting — avoid: ETN + borrow + recall risk). One ingest script; signal computes at close, trade next open or same-day MOC — fits the daily-bar harness natively.

### (d) Implementation shape
Daily: compute slope = VIX3M/VIX (or VX2/VX1). If slope > 1.0–1.05 → long SVXY sized so the *strategy* targets ~5–8% annualized vol (i.e., small notional; SVXY itself runs ~40%+ vol); if slope < 1.0 → flat, optionally small long VIXY. Vol targeting + the backwardation exit is precisely what keeps historical max DD inside 25% at the sleeve level — unfiltered buy-and-hold SVXY violates the DD gate by construction.

### (e) Failure modes / tail risks (be brutal)
- **Gap risk is the strategy.** The premium is payment for eating overnight vol spikes; a Feb-2018-style event moves faster than a daily-close signal — you will hold through the first −30–50% day of any true vol shock. Sizing must assume the day the signal can't save you.
- Termination/structure risk: XIV was terminated at −96%; issuers can change leverage (SVXY went −1x → −0.5x mid-2018) — regime breaks in the instrument itself.
- Documented decay: post-2018 the premium is thinner and the basis less predictive; 2024 was a losing year for the trade. The short-vol trade is the most crowded "alternative risk premium" in existence.
- Negative convexity + daily-reset compounding in the ETPs adds path-dependence your daily backtest must model from actual ETP prices (use real SVXY/VIXY bars, not index math).

---

## Ranked Shortlist vs. the Gate (OOS Sharpe ≥ 0.5, DD ≤ 25%, ≥5 trades, ≥50% positive folds)

| Rank | Candidate | Gate pass odds | Why |
|---|---|---|---|
| **1** | **Term-structure-timed vol ETP sleeve (SVXY/flat via VIX3M/VIX)** | ~35–45% | Only structurally-motivated premium here with literature Sharpe 0.4–0.8 net; signal + instruments are daily-bar native, data free, zero new vendor risk. DD ≤ 25% is achievable *only* via vol targeting at small notional — which the harness already supports. Biggest honest risks: post-2018 decay and holding the first day of a vol shock. Test both the timed version and a null (unfiltered) to isolate the signal. |
| **2** | **Earnings-surprise long/short (PEAD) + earnings-announcement premium, liquid universe** | ~25–35% | Academically alive-again (2025), premium version strong in large caps; many independent events per fold suits the fold criteria. Requires the one real integration on this list (Finnhub/FMP/Alpha Vantage calendar + surprises) and strict point-in-time hygiene (prefer price-based surprise). Cost literature (Chordia: 63–100% of profits) is the honest prior against it. |
| **3** | **Overnight-only long SPY/QQQ (incl. weekend-only and post-earnings variants)** | ~10–20% | Costs ~$0 to test (data already in the harness: open/close columns). Gross effect is real and current; net effect at retail is probably a few bp/day at best, and the NSPY liquidation is a professional-grade refutation. Worth one cheap pre-registered experiment precisely because refutation is fast and the post-earnings-overnight variant is the one net-of-cost survivor in the literature. |
| **4** | **Cross-asset regime overlays (VIX3M/VIX, HY-OAS on existing sleeves; SPX→BTC gate on crypto sleeve)** | n/a standalone | Won't pass the gate alone; evidence quality lowest. Value is additive: +0.1–0.2 Sharpe on the existing 0.43 portfolio could clear 0.5 *for the portfolio*. Limit to 1–2 pre-registered overlay hypotheses to respect multiple testing. Data free (FRED/CBOE). |
| **5** | **ETF/share-class pairs (sector ETF cointegration, GOOG/GOOGL)** | ~10% | Do & Faff's post-2002 net-unprofitability is the base rate; this is statistically the same mean-reversion family already exhausted at 0.43 in this repo. GOOG/GOOGL is real but the edge is basis points with too few daily-granularity signals to satisfy ≥5 trades/fold meaningfully. |
| **6** | **Index add/delete events** | <10% | Retail revival is real but low-N, announcement-latency-sensitive, and free historical announcement data doesn't exist — un-backtestable in our harness without manual data archaeology. The slow deletion-portfolio version is a multi-year value tilt, not a gate-shaped strategy. |

**Recommended sequencing for the research loop:** (1) overnight-SPY/QQQ test first — zero integration, fast kill or keep; (2) vol-ETP term-structure sleeve — one small free-data ingest, highest expected value; (3) earnings pipeline — commit only after 1–2 pays off, since it's the real integration cost; (4) overlays as portfolio-level experiments on existing sleeves. Items 5–6: log as researched-and-declined with the citations above, so the refutation is on record.
