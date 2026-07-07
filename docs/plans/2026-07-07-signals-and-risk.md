# Phase B — signals + decision/risk

Replace Phase A's trivial skeleton order with a real deterministic pipeline: a pluggable **signal**
tier over cached bars, and a non-negotiable **decision/risk** tier that turns a signal + account
state into a sized order (or a no-op) — the "agents propose, deterministic math disposes" middle
layer from [system-architecture.md](../system-architecture.md). All of it is pure and
offline-testable; LLM agents come in Phase C.

## Progress

| Milestone | Status | Notes |
|---|---|---|
| 1. Pure signal + risk/decision core | ✅ done (2026-07-07) | 17 tests; ruff + mypy --strict clean |
| 2. Bars cache + decisions journal | ✅ done (2026-07-07) | asyncpg; read-through returns recent tail |
| 3. strategy_tick workflow + live verify | ✅ done (2026-07-07) | Live: hold + buy paths, both journalled |

## Result

Live paper runs through the full stack. Both branches of the pipeline verified end-to-end:

- **Hold:** `sma_crossover / BTC-USD / 1Day` → signal `sell` → `hold`, journalled (no order).
- **Buy:** `mean_reversion / BTC-USD / 1Day` → BTC 5.68% below its 20-day MA → `buy`, sized to
  `$15.00` → order `955fdac8…` **filled** → journalled with the order id + outcome.

Postgres holds the decisions journal (decision → order_id → outcome, the evaluation record) and
the bars cache (80 BTC/USD daily bars, 2026-04-19 → today, read-through).

**Deltas from plan:**
- Added a third strategy, **`mean_reversion`** (buy below the moving average) — genuinely useful and
  the one that signals buy in a down market, so it exercises the place path.
- Bars read-through fetches a **wide window from a lookback start and returns the recent tail**: a
  bare `limit` from an old `start` returns the *oldest* bars, not the newest (caught live — signals
  were computing on 6-week-stale data).
- Bars + decisions on **direct SQL (asyncpg)**, fresh connection per call (fits the
  `asyncio.run`-per-activity edge); Dapr KV state stays for the orders mirror + workflow engine.
- `current_exposure` is 0 for the MVP (fresh-entry sizing); position-aware exposure arrives with
  position management in a later phase.
- Added a Postgres volume for durability.

## Milestone 1 — the deterministic brain (pure, no I/O)

- **domain**: `Bar`, `Signal` (`action: buy|sell|hold`, `strength: float`, `reason: str`),
  `RiskLimits`, `StrategyDecision` (`action`, `symbol`, `notional?`, `rationale`, `signal`).
- **application/signals**: pure strategy functions `bars -> Signal`, e.g. `sma_crossover(fast, slow)`
  and `momentum(lookback)`, plus a name→fn registry. Simple, well-understood placeholders — the
  *framework* (pluggable, testable, journalled) matters more than the first strategy.
- **application/risk**: `size_fixed_fractional(equity, risk_pct, price, stop_distance)` and a
  `constrain(decision, account, positions, limits)` gate (max position notional, existing-exposure
  cap, hold-on-hold). `decide(signal, account, positions, limits) -> StrategyDecision` composes them.
- **tests**: signals over synthetic bar series (known crossover/momentum), sizing math, constraint
  rejections. `ruff` + `mypy --strict` clean.

## Milestone 2 — data (bars cache + journal)

- Gateway `get_bars` client method (`Result`-typed), mapping the gateway's `{ items, nextPageToken }`.
- **Bars cache**: read-through — check store → miss → fetch from gateway → persist. Closed bars are
  immutable, so keyed by `(symbol, timeframe, ts)`. KV via Dapr state for recent bars; the analytics
  journal uses direct SQL (per the state-store design).
- **Decisions journal**: a Postgres table `decisions(ts, strategy, symbol, action, inputs jsonb,
  rationale, order_id?, outcome?)` written on every tick — the record that lets us later evaluate
  whether the intelligence adds value.

## Milestone 3 — strategy_tick workflow

`strategy_tick(strategy, symbol, timeframe, risk)`:
1. bootstrap (assert paper).
2. refresh bars (cache read-through).
3. compute signal (pure).
4. read account + positions; `decide` → `StrategyDecision`.
5. if actionable: place via the Phase A execution path (deterministic `clientOrderId`), poll fill.
6. journal the decision + outcome (always, including holds/rejections).

**DoD:** a live paper run logs a full decision with rationale; when the signal says trade, an order
places and the decision row links to it; when it says hold, a hold is journalled with no order.

## Non-goals for Phase B

No LLM agents (Phase C), no backtest harness yet (the signals are pure so a vectorbt/backtest pass
slots in later), no multi-symbol portfolio optimization. One strategy, one symbol per tick.
