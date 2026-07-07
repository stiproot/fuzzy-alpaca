# Walk-forward evaluation + strategy gate

Make the backtest gate **honest** and make it **binding**. Full-sample backtest metrics overfit;
gating live trades on them is the trap. So: evaluate strategies out-of-sample via walk-forward,
then gate the `strategy_tick` workflow on the OOS result so an unproven strategy can never place.
Closes the loop — the harness becomes a safety property of the money path, not a manual tool.

## Progress

| Milestone | Status | Notes |
|---|---|---|
| 1. Pure walk-forward + gate | ✅ done (2026-07-07) | 30 tests; ruff + mypy --strict clean |
| 2. Wire gate into strategy_tick + live verify | ✅ done (2026-07-07) | Live: buy signal blocked, no order placed |

## Result

Live: `mean_reversion / BTC-USD / 1Hour` produced a genuine **buy** signal ("buy $15.00, below
MA"). The walk-forward gate ran over 200 cached bars and **blocked** it:

```
outcome: blocked:OOS sharpe -0.28 < 0.5; OOS return -0.75% < 0.00%;
         OOS trades 2 < 5; positive folds 25% < 50%
action:  hold    order_id: null
```

No order placed; the block is fully explainable and journalled (decision #4: a buy that became a
blocked hold, distinct from plain signal holds). **The money path now refuses unproven strategies
by construction** — a strategy only reaches `place_order` if it clears an out-of-sample gate. Given
the prior backtest demo, every current strategy blocks, which is the correct safe outcome.

**Deltas from plan:**
- `_DEFAULT_NEED` bumped 40 → 200 so the gate's 4-fold walk-forward has real evaluable folds; live
  signals still key off the tail, so extra history is harmless for them.
- The gate only runs when the signal says `buy` (holds short-circuit before it) — cheap and correct.
- Walk-forward is honest by construction: the engine computes signals on `bars[:i+1]`, so each fold
  is causal; walk-forward adds the cross-window consistency requirement (`positive_folds_frac`).

## Design

Same conventions: pure `Result`/value core, effects at the edges, flat hex. Builds directly on the
Phase-prior backtest engine (`run_backtest`).

- **application/walkforward.py** (pure): `walk_forward(bars, signal_fn, config, folds)` slides an
  out-of-sample window across the series — for each fold, the strategy only ever sees bars up to
  the current point (the engine already computes signals on `bars[:i+1]`, so an expanding-window
  walk-forward is honest by construction). Returns an aggregate OOS `BacktestResult` stitched from
  the fold equity curves, plus per-fold summaries. No look-ahead.
- **domain/gate.py**: `GateCriteria` (min_sharpe, min_return, max_drawdown, min_trades) and
  `GateVerdict` (passed: bool, reasons: tuple[str, ...]).
- **application/gate.py** (pure): `evaluate(oos: BacktestResult, criteria) -> GateVerdict` — a
  strategy passes only if every criterion holds; reasons list each failure. Deliberately strict:
  the default is *block*.

## Milestone 1 — pure walk-forward + gate (offline)

Build walk-forward, criteria/verdict, and the pure gate. Unit-test: a clean uptrend passes for a
trend strategy; a random/chop series is blocked; each criterion's failure produces its reason.
`ruff` + `mypy --strict` clean.

## Milestone 2 — bind the gate into strategy_tick

- A `gate_activity` runs walk-forward over freshly cached bars and returns the verdict (persisting
  the OOS result to `backtests` for the record).
- `strategy_tick`: after `decide`, if the decision is `buy`, consult the gate. **Blocked → do not
  place**; journal the decision with `outcome="blocked:<reasons>"` and no order. Passed → place via
  the existing idempotent path.
- **DoD (live):** a `buy` decision on a strategy that fails walk-forward is journalled as blocked
  with reasons and places **no** order; the money path now refuses unproven strategies by
  construction. (Given the prior demo, all three current strategies should block — which is the
  correct, safe outcome.)

## Non-goals

No deflated-Sharpe / MinBTL yet (they refine the gate criteria next), no parameter optimization,
no purged/embargoed cross-validation — a simple expanding-window walk-forward is the honest
baseline.
