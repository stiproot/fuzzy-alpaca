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
| `apps/orchestrator` | Dapr-Workflows trading loops + intelligence *(building)* | Python |

## Conventions

- **Hexagonal architecture** for every service, in the *pragmatic* (flat) layout — `domain/`,
  `application/`, `infrastructure/` at the top of a service's `src/`, not deeply nested.
- **Functional style** throughout: Effect-TS in the gateway; a functional, immutable,
  Result-typed style in the Python services.
- Plan docs are transient change logs in [`docs/plans/`](docs/plans/); durable knowledge is
  extracted to the permanent docs (see [CLAUDE.md](CLAUDE.md)).
- `h` (`../h`) is a **reference** for Dapr patterns, not a dependency.
