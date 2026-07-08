# Research: cross-sectional equity factors (2026-07-08)

*One of four parallel research reports feeding [the backlog](../backlog.md). Constraints assumed:
Alpaca (equities + long-only spot crypto), daily bars, retail latency, walk-forward gate (OOS
Sharpe ≥ 0.5, DD ≤ 25%).*

**Framing.** Our gate is *absolute* OOS Sharpe ≥ 0.5, positive OOS return, max DD ≤ 25%, ≥5 trades, ≥50% positive folds. Two facts dominate everything below:

1. **Post-publication decay is real and large.** [McLean & Pontiff (2016, Journal of Finance)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2156623) studied 97 published cross-sectional predictors: returns are **~26% lower out-of-sample and ~58% lower post-publication** ([full paper PDF](https://www.hec.ca/finance/Fichier/McLean.pdf)). Any headline Sharpe from a factor paper should be haircut by roughly half before you even model costs.
2. **Realistic standalone net factor Sharpes cluster at 0.2–0.4**, not the 0.7–1.0 of in-sample academic tables. The factor-zoo/trading-cost literature ([Chen & Velikov, "Accounting for the Anomaly Zoo"](https://jacobslevycenter.wharton.upenn.edu/wp-content/uploads/2019/09/Accounting-for-the-Anomaly-Zoo.pdf)) finds costs consume most of the average anomaly's post-publication return; practitioner replications put individual long-short factors at Sharpe **~0.16 (momentum) to ~0.4 (value/growth)** after costs ([arXiv factor-allocation study](https://arxiv.org/pdf/2410.14841)). A single long-short factor clearing an *absolute* 0.5 OOS Sharpe net, at retail, is the exception, not the base case.

Implication up front: for our gate, **long-only factor *tilts* on liquid large caps** (which carry equity beta plus a modest tilt premium) and **factor *combinations*** are far more likely to pass than any standalone long-short factor.

---

## 1. Cross-sectional momentum (12-1 month)

**(a) Evidence quality.** The deepest evidence base of any anomaly: Jegadeesh–Titman (1993), out-of-sample across 200+ years, dozens of countries and asset classes. But the modern picture is grim for the classic long-short form: [Daniel & Moskowitz, "Momentum Crashes" (NBER w20439)](https://www.nber.org/system/files/working_papers/w20439/w20439.pdf) document short, catastrophic loser-rally episodes (1932, 2009, 2020) where the short leg loses 40–100% in weeks. A recent replication on the S&P 500 universe, ["Evaluating a 12-1 Month Momentum Strategy (2005–2024)" (SSRN 5367656)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5367656), found the canonical decile long-short strategy 2006–2024 delivered **net annualized return −2.8%, Sharpe −0.23, max drawdown −81%** at only 10 bps/side — the failure came from the short leg, not costs or the ranking signal.

**(b) Realistic net OOS Sharpe today.**
- Long-short deciles, large caps: **≈ 0 to negative** post-2005 ([SSRN 5367656](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5367656)); after-cost practitioner estimates ~0.16 ([arXiv](https://arxiv.org/pdf/2410.14841)). Fails our DD gate catastrophically (−81%).
- **Long-only momentum tilt** (hold top-decile/quintile of a liquid universe, monthly): live ETF evidence is the honest benchmark — MTUM returned ~16.8%/yr vs 15.4%/yr for SPY over the past 10 years, with higher volatility ([PortfoliosLab MTUM vs SPY](https://portfolioslab.com/tools/stock-comparison/MTUM/SPY)). Absolute Sharpe roughly market-like, ~0.6–0.8 in normal decades — **but most of that is beta**. Excess-over-market Sharpe is ~0.1–0.2.

**(c) Data required.** Only daily/monthly prices for the universe — **Alpaca's own data suffices**, zero new integrations. This is the cheapest signal on this list.

**(d) Implementation shape.** Universe: S&P 500 / Russell 1000-ish liquid names (300–500 tickers via Alpaca assets API + a static index list). Rank on 12-month return skipping the most recent month; hold top 20–50 names, equal- or vol-weighted; **monthly rebalance** (turnover ~50%/side/month for L/S, much less long-only). Long-only strongly preferred; if long-short, cap the short leg and add a crash filter (e.g., skip shorts when trailing market return < 0 — the Daniel–Moskowitz dynamic-momentum fix).

**(e) Risks/failure modes.** Momentum crashes (short leg); long-only version inherits market drawdowns >25% (2008, 2020, 2022 — will fail the DD gate in folds containing them unless the vol-targeting layer we already have clamps it); high turnover concentrated in volatile names; crowding — momentum is the most arbitraged factor post-publication.

---

## 2. Post-earnings announcement drift (PEAD)

**(a) Evidence quality.** Classic (Ball & Brown 1968; Bernard & Thomas 1989: ~2% drift over 60 trading days per direction, ~18% annualized L/S — [Wikipedia summary](https://en.wikipedia.org/wiki/Post%E2%80%93earnings-announcement_drift), [Quantpedia](https://quantpedia.com/strategies/post-earnings-announcement-effect)). But the modern evidence is the most negative on this list: [Martineau, "Rest in Peace Post-Earnings Announcement Drift" (SSRN)](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3111607) shows drift vanished from non-microcaps around 2001 and **completely by ~2006** — prices now impound the surprise on announcement day. Two 2025 papers claimed PEAD is alive, but [UCLA Anderson Review's reconciliation](https://anderson-review.ucla.edu/is-post-earnings-announcement-drift-a-thing-again/) (Subrahmanyam) shows the revival is a **microcap artifact**: t-stat 2.18 with microcaps included, **1.43 once excluded**. Microcaps are ~3% of market value and largely untradeable at size.

**(b) Realistic net OOS Sharpe today.** In the liquid universe a retail system can actually trade: **≈ 0**. In microcaps, gross drift exists but spreads, borrow, and impact eat it. This is the textbook McLean–Pontiff full-decay case.

**(c) Data required (if pursued anyway).** Historical earnings *dates* + actual vs consensus EPS: [Financial Modeling Prep earnings-surprises API](https://site.financialmodelingprep.com/developer/docs/earnings-surprises-api) (cheap paid tiers; free tier limited), [Finnhub EPS estimates/calendar](https://finnhub.io/docs/api/company-eps-estimates) (free tier), Alpha Vantage EARNINGS endpoint (free). Watch point-in-time integrity: vendor "consensus" history is often restated. An estimate-free variant (SUE from trailing EPS via [SEC EDGAR companyfacts](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)) avoids the estimates problem but is exactly the version shown dead.

**(d) Implementation shape.** Enter T+1 after announcement, hold ~60 trading days, long top-SUE decile (short bottom decile if L/S), quarterly-clustered event portfolio.

**(e) Risks/failure modes.** The anomaly is dead where we can trade; earnings events are gap-risk concentrated; consensus-estimate data quality at retail vendors is poor pre-2015. **Recommend: do not build.** (A possible salvage — LLM-scored earnings-call *text* drift, per [PEAD.txt, JFQA](https://www.cambridge.org/core/journals/journal-of-financial-and-quantitative-analysis/article/peadtxt-postearningsannouncement-drift-using-text/5EB217BB68B5FB054FE38541BAAC4679) — is a different, DeepSeek-in-the-loop research program, not classic PEAD.)

---

## 3. Short-term reversal (weekly cross-sectional)

**(a) Evidence quality.** Well documented gross (Jegadeesh 1990; Lehmann 1990; [Quantpedia summary](https://quantpedia.com/strategies/short-term-reversal-in-stocks)). The load-bearing paper for feasibility is [de Groot, Huij & Zhou (Robeco), "Another Look at Trading Costs and Short-Term Reversal Profits"](https://www.efmaefm.org/0efmameetings/efma%20annual%20meetings/2011-Braga/papers/0259.pdf): naive reversal is destroyed by costs, but restricting to the **100–500 largest stocks** with turnover-aware construction retained **30–50 bps/week net** in their (2000–2009, institutional-cost) sample. Residual-reversal variants ([Blitz–Huij](https://www.efmaefm.org/0EFMSYMPOSIUM/2012/papers/017_update.pdf)) roughly double gross Sharpe by stripping factor exposure. Recent work ties profitability to retail order-flow regimes ([Chen et al., SSRN 4622831](https://papers.ssrn.com/sol3/Delivery.cfm/4622831.pdf?abstractid=4622831&mirid=1)).

**(b) Realistic net OOS Sharpe today.** Honest haircut: the strong net numbers are from pre-2010 samples; decimalization + HFT market-making has since compressed the premium (the same mechanism that killed PEAD). Large-cap-only, weekly, with Alpaca zero commissions but real spread/slippage: **~0.2–0.5 net, high uncertainty**. This is the highest-variance estimate on the list — it either works modestly or costs eat it; only our own harness with a per-side cost sweep (5/10/20 bps) can settle it.

**(c) Data required.** Prices only — **Alpaca daily bars suffice**. Zero new integrations. (Residual reversal additionally needs rolling factor regressions — computable from prices.)

**(d) Implementation shape.** Universe: 100–500 most liquid US large caps. Weekly: rank on prior 1-week (or residual) return, long bottom quintile / short top quintile, equal-weight, full weekly rebalance. Turnover is extreme (~100%+/week) — cost modeling is the whole game. Long-only "buy last week's large-cap losers" is testable but weaker.

**(e) Risks/failure modes.** Transaction costs (the dominant one); it is a liquidity-provision strategy, so it loses exactly when spreads blow out (crash weeks); short leg needed for most of the premium; overlaps with our already-tested Bollinger mean reversion (this is the *cross-sectional* cousin — genuinely a different signal, but correlated; expect the portfolio benefit, not a new standalone star).

---

## 4. Low-volatility / quality / profitability

**(a) Evidence quality.** Strong and old: low-vol (Haugen 1972 onward; [Quantpedia](https://quantpedia.com/strategies/low-volatility-factor-effect-in-stocks)), [Frazzini & Pedersen, "Betting Against Beta"](https://pages.stern.nyu.edu/~lpederse/papers/BettingAgainstBeta.pdf) (historical BAB Sharpe ~0.7–0.9 gross, but requires leverage on the long leg), Novy-Marx profitability (2013), Asness et al. QMJ. Recent academic work still finds low-vol adds 13–17% to factor-model Sharpe ([BNP survey](https://www.bnpparibas-am.com/en-us/portfolio-perspectives/evidence-of-the-low-volatility-anomaly/); [Betting Against (Bad) Beta, 2024](https://arxiv.org/abs/2409.00416): BAB gross Sharpe ~1.0 on 1963–2021 monthly data — gross, leveraged, frictionless).

**(b) Realistic net OOS Sharpe today.** The live-fund record is the honest number: over the last 10 years **SPLV returned 8.3%/yr vs 13.5%/yr for the S&P 500**; over the last 5 years USMV +45% vs SPY +92% ([Seeking Alpha SPLV review](https://seekingalpha.com/article/4822603-splv-everything-you-need-to-know-about-low-volatility-etf), [24/7 Wall St on USMV](https://247wallst.com/investing/2026/05/26/usmvs-minimum-volatility-promise-got-trounced-by-the-sp-500-wait-for-redemption-or-run/)). Absolute Sharpe of long-only low-vol: roughly market-like, **~0.5–0.7 across full cycles**, achieved via *much* lower vol and roughly half the market's drawdowns (2022: S&P −25%, USMV ~−18% better relative; 2025 bear: low-vol ETFs drew down ~9% vs −18% market). Quality/profitability long-short (RMW-style): **~0.2–0.35 net standalone**. Leveraged BAB is not retail-feasible on Alpaca (margin cost + borrow).

**(c) Data required.** Low-vol: **prices only** (trailing 1-year daily vol or beta) — Alpaca suffices. Quality/profitability: fundamentals — **free** via [SEC EDGAR companyfacts/XBRL APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) (no key, JSON, full history to 2009+; use the filing *acceptance date* as the point-in-time knowledge date to avoid lookahead — see [tutorial](https://tldrfiling.com/blog/sec-edgar-xbrl-api-python-tutorial)); or convenience wrappers via [FMP](https://site.financialmodelingprep.com/developer/docs/stable/earnings-company) / Finnhub paid-cheap tiers. Gross profitability = (Revenue − COGS)/Assets needs only three XBRL tags.

**(d) Implementation shape.** Long-only, 30–100 lowest-vol (or highest-quality-composite) names from the 500 most liquid; **monthly or quarterly rebalance**; turnover is *low* (a major advantage at retail). Combines naturally with our existing vol-targeting layer.

**(e) Risks/failure modes.** Long stretches of underperforming a roaring beta market (the entire 2015–2025 experience — positive-fold criterion is fine, but absolute Sharpe in growth-led folds will be mediocre); interest-rate sensitivity (low-vol is bond-proxy-heavy); crowding cycles ("low vol is not buy-and-hold" — [Pacer](https://www.paceretfs.com/resources/resource-library/low-volatility-is-not-a-buy-and-hold-strategy/)). Its virtue for *our* gate is the drawdown profile, not the return.

---

## 5. Value (P/B, P/E composites)

**(a) Evidence quality.** Canonical (Fama–French HML), but the recent-decade record is the worst of the classic factors: HML drew down **−55% from 2007 to mid-2020**, the largest since 1963 ([Arnott et al., "Reports of Value's Death May Be Greatly Exaggerated", FAJ](https://www.tandfonline.com/doi/full/10.1080/0015198X.2020.1842704)); partial recovery 2021–2022 (+8% vs market in the 2022 rate shock) then mixed ([Alpha Architect](https://alphaarchitect.com/resurrecting-the-value-premium/)). Standard critique: book value misses intangibles; intangible-adjusted composites (P/E + EV/EBITDA + FCF yield) fare better than raw P/B.

**(b) Realistic net OOS Sharpe today.** Long-short HML-style: **~0.1–0.3 net**, with decade-long flat/negative stretches — will fail the ≥50%-positive-folds criterion over many walk-forward windows. Long-only large-cap value tilt: market-like Sharpe, small tilt contribution. Practitioner after-cost estimates put value near the top of single factors at **~0.4** ([arXiv](https://arxiv.org/pdf/2410.14841)) — still below our gate standalone.

**(c) Data required.** Fundamentals: free via **SEC EDGAR companyfacts** (point-in-time via filing dates) or FMP ratios endpoints; prices from Alpaca. Composite of earnings yield, FCF yield, EV/EBITDA recommended over pure P/B.

**(d) Implementation shape.** Long-only cheapest-quintile of liquid large caps, **quarterly rebalance** (very low turnover — retail-friendly); best used *inside* a multi-factor composite (value + momentum are strongly negatively correlated, the most robust pairing in the literature).

**(e) Risks/failure modes.** Regime dependence on rates/inflation; value traps (mitigated by pairing with quality/momentum); multi-year drawdowns vs market that dwarf our fold lengths.

---

## Other promising directions surfaced

- **Factor momentum** (rotate among factor portfolios by their own trailing returns) largely subsumes stock momentum and is implementable monthly on top of the factor sleeves above ([Ehsani & Linnainmaa](https://www.aeaweb.org/conference/2020/preliminary/paper/RHhbnykd); [Evidence Investor summary](https://www.evidenceinvestor.com/post/factor-momentum-and-stock-momentum)). Build only after ≥2 factor sleeves exist.
- **Benchmark data for validation:** Ken French data library and Chen–Zimmermann Open Source Asset Pricing give free monthly factor returns — use them to sanity-check our own factor construction before trusting any backtest.

---

## Ranked shortlist (best risk-adjusted prospects for our gate first)

1. **Long-only multi-factor composite (momentum × quality/low-vol × value) on ~300–500 liquid large caps, monthly rebalance.** Each factor alone nets ~0.2–0.4; their low/negative mutual correlations are the one free lunch the post-publication literature still supports. Combined with our existing vol-targeting layer, absolute OOS Sharpe 0.5–0.7 with DD ≤ 25% is realistic. Data: Alpaca prices + free EDGAR fundamentals.
2. **Long-only low-volatility/quality tilt, monthly/quarterly.** Weakest expected *return* but the best fit to the DD ≤ 25% and positive-folds criteria; cheapest to build (prices only for the low-vol half). Realistic absolute Sharpe ~0.5 across full cycles — borderline pass.
3. **Long-only 12-1 momentum tilt (top-quintile large caps, monthly) with the existing vol-target as crash clamp.** Strong return engine, prices-only data, but inherits >25% market drawdowns without the clamp; long-short version is disqualified outright (−81% DD post-2006).
4. **Large-cap short-term reversal (weekly, top-100/500 liquidity screen, ideally residual-reversal).** Genuine cross-sectional signal we haven't tested, prices-only — but the net-of-cost estimate is the most uncertain, and it's correlated with our existing Bollinger mean-reversion sleeve. Test cheaply with a strict cost sweep; expect a coin flip.
5. **Standalone value.** Only as a sleeve inside #1; standalone it fails the folds criterion too often.
6. **Classic PEAD.** Do not build — dead in the tradeable universe since ~2006 (Martineau; Subrahmanyam reconciliation). Only the LLM-text variant merits a future, separate hypothesis.

**Can anything clear an OOS Sharpe 0.5 gate?** Honestly: no *standalone long-short* factor should be expected to — post-publication decay (~50%) plus retail costs puts every single-factor L/S at net Sharpe ~0.15–0.4, and momentum/reversal L/S additionally violate the 25% drawdown cap. What realistically clears the gate is (i) a **long-only multi-factor tilt**, because equity beta contributes ~0.4–0.6 of absolute Sharpe and the tilt adds 0.1–0.2 with modest turnover, and (ii) possibly a **defensive low-vol/quality sleeve**, whose drawdown profile is tailor-made for our gate even when its return is pedestrian. One caveat to log before running anything: because the gate is *absolute* Sharpe, a long-only factor tilt can pass mostly on beta — we should additionally record Sharpe *versus a SPY buy-and-hold control* on identical folds, so a "pass" is attributable to the factor and not to owning the market in a good window.
