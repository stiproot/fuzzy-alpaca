# Strategy-research loop

Establish the disciplined loop the system exists to run: **research → document → experiment →
update → improve → repeat**, with the goal of finding a strategy that genuinely clears the
walk-forward gate (so a future live run is a real profit test, not a soak of no-edge strategies).
Everything is honest: failed experiments are recorded, and overfitting is guarded against, not
hidden.

## The loop (durable methodology → docs/experiments.md)

1. **Research** — form a hypothesis ("trend strategies work better on higher timeframes").
2. **Document** — write the hypothesis + method into `docs/experiments.md` before running.
3. **Experiment** — run it through our own gate machinery (backtest → walk-forward → gate).
4. **Update** — record the result (pass/fail + metrics + the honest reading) in the same doc.
5. **Improve** — make one system change the result motivates (new strategy, parameterization,
   agent capability, tighter gate).
6. **Repeat.**

`docs/experiments.md` is the permanent, human-readable log. Plan docs stay transient.

## Progress

| Milestone | Status | Notes |
|---|---|---|
| 1. Logical container names | ✅ done (2026-07-08) | fa- prefix; compose config valid |
| 2. Sweep harness + cycle 1 | ✅ done (2026-07-08) | 2/72 passed on 400 bars → 0 on 1000 (false positives) |
| 3. experiments.md + document cycle 1 + improve | ✅ done (2026-07-08) | see docs/experiments.md Experiment 1 |

## Cycle 1 outcome

No robust edge: naive TA's two apparent passes were short-window false positives that vanished on
deeper data — the gate + hold-out confirmation caught the mirage before any paper trade. Full
record in [docs/experiments.md](../experiments.md#experiment-1). System improvement: `sweep.py`
now evaluates deep (1000 bars) by default + prints a multiple-testing caveat. The loop is
established and ran one honest cycle.

## Cycle 1 — hypothesis & method

**Hypothesis:** our three strategies fail on BTC/1Day with default params, but the *default params
are arbitrary*. A modest, principled sweep of (strategy, params) × (symbol) × (timeframe) may reveal
a config that clears the OOS gate — or, just as valuably, confirm that naive TA has no edge here.

**Method:** `scripts/sweep.py` fetches bars once per (symbol, timeframe) via the gateway, then runs
every config through `walk_forward` + `evaluate` (our real gate). Ranked by OOS Sharpe; any PASS
flagged. Grid: sma_crossover / momentum / mean_reversion across a few param sets, on BTC/ETH (and
more if available), 1Hour + 1Day.

**Overfitting guard (non-negotiable honesty):** sweeping N configs and keeping the best is
multiple-testing — the exact bias deflated-Sharpe/MinBTL warn about. So: (a) the gate already
demands OOS consistency (positive-folds), and (b) a "pass" is only interesting if it holds on a
*second* symbol it wasn't chosen on. A single lucky pass is documented as suspect, not adopted.

## Agent-acts-on-research (design; build when a strategy passes)

The research-agent's proposals become actionable via a **gated trigger**: a proposal can request a
`strategy_tick` run for a strategy/symbol, which re-runs the binding walk-forward gate before any
order. The agent gains agency but **cannot bypass the gate** — the safety invariant holds. Built in
a later cycle, once cycle-N produces a strategy worth acting on; premature now (everything blocks).

## Non-goals

No brute-force mega-sweep (overfitting theatre), no live run until something passes honestly, no
gate-bypass mode.
