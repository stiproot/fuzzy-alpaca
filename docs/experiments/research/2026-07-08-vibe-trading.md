# Research: vibe-trading (HKUDS) — what it is, what it claims, how we use it (2026-07-08)

*Synthesis of a 5-agent exploration of `../trading/vibe-trading` (v0.1.10, MIT). Intent: use it as
a tool under our orchestration layer, not rebuild it. All paths repo-relative to vibe-trading.*

## What it is

An LLM-agent finance **research workspace** (HKU Data Science group): a ReAct agent
(LangChain/LangGraph, FastAPI + React) that turns natural-language prompts into data pulls,
LLM-generated strategy code, backtests, factor benches, and multi-agent "swarm" analyses.
DeepSeek is a first-class LLM provider (`src/providers/llm_providers.json` — relevant to us).
Data: 19 loaders with fallback chains (yfinance/stooq/tiingo/ccxt/OKX/tushare/SEC/…, plus
`local` CSV/parquet injection). Brokers: 10 connectors incl. Alpaca. Very active (near-daily
releases), ~236 test files / ~4700 tests, honest disclaimers throughout.

## What it claims — the part that matters for our gate

**It claims no winning strategies.** Self-framing is "research, simulation, backtesting"
(`README.md:215`); no live results, Sharpe, or win-rate claims anywhere. It ships **signals, not
strategies**: a ~456-factor **Alpha Zoo** (`agent/src/factors/zoo/`) — alpha101 (Kakushadze 101,
`equity_us`), gtja191 (Guotai Junan, `equity_cn`), qlib158 (Qlib features), 10 academic factors
(price-proxy Fama-French et al.), 4 PIT-safe SEC fundamentals. Evaluated by daily **rank-IC**, not
PnL.

The single concrete edge claim is the research-lab study
(`wiki/research-lab/posts/alpha-191-in-2026.html`): of 191 GTJA alphas on CSI 300, 2018–2025,
**10 (5%) are "alive"** (mean 1-day rank-IC > 0.02, t > 2, ≥55% positive days), 15 reversed, 165
dead. Top survivors (formulas verbatim in the zoo modules):

| Alpha | Mechanism | Mean IC | IR |
|---|---|---|---|
| `gtja191_171` | `-1*((l-c)*(o^5))/((c-h)*(c^5))` — range/microstructure | 0.0432 | 0.269 |
| `gtja191_111` | SMA-diff of volume-scaled close-in-range — volume/microstructure | 0.0349 | 0.223 |
| `gtja191_163` | `rank(((-1*ret)*mean(v,20))*vwap*(high-close))` — reversal×volume | 0.0347 | 0.201 |
| `gtja191_054` | vol-of-body + close/open corr — volatility | 0.0272 | 0.161 |
| `gtja191_002` | `-1*delta(((c-l)-(h-c))/(h-l),1)` — reversal/microstructure | 0.0262 | 0.162 |

Theme survival: microstructure/range 22%, reversal 11%, momentum 2% — *consistent with our own
cycles 4–5 (reversion had breadth; momentum didn't)*.

**Their own caveats:** IC ≠ profitability (no costs; ~100% daily turnover typical);
**survivorship-biased universe** (current CSI 300 applied retroactively); A-shares only — not
Alpaca-tradable. Their strict bench (`agent/src/factors/bench_runner_strict.py`) even admits only
1 of 12 factors survived a random-control comparison. And their `walk_forward` validation
(`agent/backtest/validation.py`) is **in-sample window slicing, not OOS** — never treat their
numbers as gate-equivalent.

## Integration surfaces (ranked for a Dapr-workflow orchestrator)

1. **Pure-python extraction (best).** Zoo alphas are standalone `compute(panel) -> DataFrame`
   over OHLCV with no repo deps; strategy contract is one pandas class
   (`SignalEngine.generate(data_map) -> {sym: Series in [-1,1]}`). Trivially portable into our
   pure harness — hours, not days.
2. **Subprocess backtester.** `python -m backtest.runner <run_dir>` (`config.json` +
   `code/signal_engine.py` in, metrics JSON + `artifacts/equity.csv` out); stateless,
   LLM-free, feed our bars via `source: "local"` (`~/.vibe-trading/data-bridge/config.yaml`).
   Already wrapped as a 300s-timeout subprocess tool (`agent/src/tools/backtest_tool.py`) —
   clean shape for a workflow activity. Cost model caveat: US equity defaults to zero commission
   + 5 bps slippage (optimistic; override).
3. **MCP server** (`vibe-trading-mcp`, 54 tools, stdio/SSE): `get_market_data` (keyless
   multi-source OHLCV), `backtest`, `factor_analysis`, `run_swarm(start_only=True)` + polling.
   Read-only by design — no order tools. Good bolt-on for our research agent.
4. **REST API** (`vibe-trading serve`): sessions (LLM-in-loop), `/alpha/bench|compare`
   (202 + SSE, in-memory job table — restart loses jobs), swarm runs (disk-persisted, pollable).
   Least orchestration-friendly of the compute surfaces.
5. **Execution: never.** Its order path is an LLM calling `trading_place_order` directly; money
   is floats; no idempotency keys; paper orders are ungated. Execution stays on our gateway —
   we use only its read/data/backtest surfaces.

## Ideas (what our orchestration layer does with it)

- **A. Test its claimed winners through our gate — on our universe.** The GTJA survivors are pure
  OHLCV formulas; computing them on US large caps and gating them is a *stronger* test than the
  original (data they were not selected on — no survivorship rescue). This is the "test their
  winning strategies first" item, translated honestly. Needs a small **cross-sectional evaluator**
  (rank names daily, hold top-K) in our harness — which backlog #4 (multi-factor composite) needs
  anyway; one build serves both.
- **B. Second-engine cross-check.** Wrap `backtest.runner` as a workflow activity fed by our bars
  (`source: "local"`); run our passing configs through their engine and diff equity curves.
  Engine disagreement = bug detector for *our* harness (they found and fixed annualization and
  lookahead bugs too — independent implementations catch each other).
- **C. Data-source breadth.** Their loader chain (esp. SEC EDGAR fundamentals loaders, multi-venue
  crypto via ccxt, stooq/tiingo fallbacks) via MCP `get_market_data` — fills gaps our gateway
  doesn't cover, useful for backlog #4 (fundamentals) and #6–7 (crypto sources).
- **D. Hypothesis generator, gate-disposed.** Their swarm presets (risk committee, trading desk)
  with DeepSeek as provider, invoked `start_only` from a workflow, output parsed into
  `backlog.md` entries — LLM proposes, our gate disposes. Matches our intelligence-layer design.
- **E. Alpha Zoo as a factor library.** 101 `equity_us` alphas + academic factors are a
  ready-made feature set for the multi-factor composite cycle — with the strong prior (their own
  study) that ~95% are dead; the alive-theme distribution tells us where to spend trials.

## Recommended first cycle (jumps the queue per "test their winners first")

**Hypothesis 007-candidate:** the 5 surviving GTJA microstructure/reversal alphas, computed on our
57-name US large-cap basket as a daily cross-sectional long-top-quintile portfolio (equal-weight,
next-open execution, real costs), clear our walk-forward gate — versus the null that the IC
survivors are A-share microstructure artifacts + survivorship bias. Trials: 5 alphas,
pre-registered; SPY buy-and-hold control; expect most to die at ~100% daily turnover × costs (a
20-day-smoothed variant is the one pre-registered turnover mitigation). Build needed: bar→panel
adapter + cross-sectional portfolio evaluator in our harness (reusable for backlog #4).
