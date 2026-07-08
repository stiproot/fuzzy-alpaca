# fuzzy-alpaca

A standalone automated-trading **system** on Alpaca (equities + crypto) and Dapr Workflows:
a stateless broker gateway, a deterministic orchestrator, and an intelligence layer. Agents and
quant signals propose; deterministic workflows execute against the typed, idempotent gateway.

## How we build

@.claude/conventions.md

## Where truth lives

- `docs/system-architecture.md` — the whole-system shape (gateway = component one; orchestrator,
  intelligence, state, MCP). `h` (`../h`) is a *reference* for Dapr patterns, not a dependency.
- `docs/architecture.md` — the gateway's as-built design (layers, call recipes, error contract,
  order-safety stances). Read before changing gateway structure.
- `docs/orchestration-guide.md` — how an orchestrator consumes the gateway; state-store design;
  intelligence-layer shape; guardrails.
- `docs/experiments.md` — the running strategy-research log: every hypothesis, method, result and
  refutation, honest about overfitting. The durable record of what edge we have (and don't). The
  loop that produces it — **research → document → experiment → validate → document** — lives in
  `.claude/conventions.md`.
- `apps/gateway/openapi.json` (`bun run openapi`) — the authoritative wire contract.
- `apps/*/README.md` — per-component runbook, scripts, env.
- `docs/concepts/` — plain-language explainers for the domain.
- `docs/plans/` — historical plan documents only. Never current truth.

## Gateway-specific (Effect-TS)

- Follow the effect-claude-primitives plugin skills; load the relevant skill before writing Effect
  code in an unfamiliar area.
- The Alpaca-SDK import quarantine and hexagonal dependency rule are lint-enforced — go through the
  `AlpacaClient` port.
- Verify against the live paper account via `bun run smoke` (needs `.env`; not in CI; read-only on
  real positions).
