# Backtest harness

The missing gate in the validation pipeline (backtest → walk-forward → paper → live). A **pure**
engine that replays a strategy over historical bars and scores it, reusing the Phase B signal tier
directly. Turns "the strategy trades" into "the strategy trades and we know whether it has edge."

## Progress

| Milestone | Status | Notes |
|---|---|---|
| 1. Pure backtest engine + metrics | ✅ done (2026-07-07) | 24 tests; ruff + mypy --strict clean |
| 2. Runnable over real bars + persist | ✅ done (2026-07-07) | CLI + backtests table; demo below |

## Result

`uv run python scripts/backtest.py --strategy <s> --symbol BTC/USD --bars 200` over real gateway
bars, with default fees (0.25%) + slippage (0.05%). The gate immediately earns its keep — **all
three naive strategies lose money** on 200 days of BTC, so none should get capital:

| strategy | return | Sharpe | max DD | trades | win rate |
|---|---|---|---|---|---|
| sma_crossover | −5.1% | −0.27 | 14.8% | 3 | 33% |
| momentum | −15.5% | −1.09 | 21.0% | 10 | 10% |
| mean_reversion | −35.4% | −1.51 | 40.0% | 9 | 67% |

`mean_reversion`'s 67% win rate with a −35% return is the textbook "catching a falling knife"
failure — many small wins, a few catastrophic losses — which the harness correctly surfaces
(win rate alone lies; Sharpe + drawdown tell the truth). Results persisted to `backtests`.

**Deltas from plan:** the CLI (and cache) fetch a wide window and take the recent tail; `url_symbol`
/ `lookback_start` promoted to public shared helpers. Sharpe is annualized via a
`periods_per_year` config (252 default for daily).

## Design

Same conventions: pure `Result`/value-returning core, effects at the edges, flat hex.

- **domain**: `BacktestConfig` (fees_pct, slippage_pct, starting cash, RiskLimits, warmup),
  `BacktestResult` (total_return, sharpe, max_drawdown, num_trades, win_rate, final_equity,
  equity curve), `Trade` (entry/exit ts + price + pnl).
- **application/metrics.py**: pure — `total_return`, `sharpe` (annualization-agnostic; ratio of
  mean/stdev of per-step returns × √periods), `max_drawdown` over an equity curve.
- **application/backtest.py**: `run_backtest(bars, signal_fn, config) -> BacktestResult`. Long-flat
  simulation: at each bar `i >= warmup`, compute the signal on `bars[:i+1]`; enter long on `buy`
  when flat, exit on `sell` when long; mark equity each step; apply fees + slippage on fills. Pure
  and deterministic — no I/O, no clock/random.

Honesty knobs baked in (per the guide): fees and slippage are first-class and default non-zero,
so a frictionless mirage can't pass. Sharpe/maxDD reported alongside return, never return alone.

## Milestone 1 — pure engine + metrics (offline)

Build the domain types, metrics, and engine; unit-test over synthetic series with known outcomes
(a clean uptrend should profit a momentum/crossover strategy; fees should reduce return; a chop
series should not manufacture edge). `ruff` + `mypy --strict` clean.

## Milestone 2 — runnable over real bars + persist

- A `uv run` CLI (`scripts/backtest.py`) that pulls bars from the gateway for a symbol/timeframe
  and backtests a named strategy, printing the metrics table.
- Persist a `backtests` row (config + metrics + timestamp) — the record that gates a strategy
  before it earns paper/live capital.
- Demo over real BTC/USD daily bars for the three strategies.

## Non-goals

No walk-forward/deflated-Sharpe yet (they layer on top of this engine next), no portfolio-level
multi-symbol backtest, no parameter optimization. One strategy, one symbol, long-flat.
