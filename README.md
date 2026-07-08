# fuzzy-alpaca

A standalone automated-trading **system** built on [Alpaca](https://alpaca.markets) (equities +
crypto) and Dapr Workflows. Agents and quant signals propose; deterministic workflows execute
safely against a typed, idempotent broker gateway.

Architecture: [docs/system-architecture.md](docs/system-architecture.md). How the orchestration
and intelligence layers work: [docs/orchestration-guide.md](docs/orchestration-guide.md). Trading
concepts for newcomers: [docs/concepts/](docs/concepts/).

## Components

| Path | Component | Stack |
|---|---|---|
| [`apps/gateway`](apps/gateway) | Broker gateway — typed, idempotent Alpaca adapter | Effect-TS |
| [`apps/orchestrator`](apps/orchestrator) | Dapr-Workflows trading loops + strategy intelligence (signals, walk-forward gate, research agent) | Python |

## How we find edge — the research loop

Finding a profitable strategy is empirical, and **honesty is the whole game**. Every idea runs one
loop: **research → document → experiment → validate → document**.

1. **Research** — one falsifiable hypothesis (strategy / params / universe), from a human or the
   research agent. One variable at a time.
2. **Document** — write the hypothesis + method into a new file under
   [`docs/experiments/`](docs/experiments/) (from the [template](docs/experiments/TEMPLATE.md))
   *before* running it.
3. **Experiment** — run it through the shared harness (`sweep`, `backtest`, `portfolio`), the same
   pure machinery a live decision uses.
4. **Validate** — the walk-forward **gate** (out-of-sample Sharpe / return / drawdown / folds) is
   the arbiter. A pass on one window is a *hypothesis, not an edge*: it must hold on data it was not
   selected on. Multiple-testing is assumed.
5. **Document** — result → conclusion → improvement → next, back into the experiment file, with a
   summary row in the log. **Failures and refuted mirages are logged, not hidden** — that is the
   point.

The gate is binding on the money path: an unproven strategy never trades.
[`docs/experiments.md`](docs/experiments.md) is the log of what edge we have — and don't — linking
one detailed file per experiment in [`docs/experiments/`](docs/experiments/); the researched queue
of candidate hypotheses is [`docs/experiments/backlog.md`](docs/experiments/backlog.md).

## Conventions

- **Hexagonal architecture** for every service, in the *pragmatic* (flat) layout — `domain/`,
  `application/`, `infrastructure/` at the top of a service's `src/`, not deeply nested.
- **Functional style** throughout: Effect-TS in the gateway; a functional, immutable,
  Result-typed style in the Python services.
- Plan docs are transient change logs in [`docs/plans/`](docs/plans/); durable knowledge is
  extracted to the permanent docs (see [CLAUDE.md](CLAUDE.md)).
- `h` (`../h`) is a **reference** for Dapr patterns, not a dependency.
