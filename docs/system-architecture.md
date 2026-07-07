# fuzzy-alpaca — standalone system architecture

fuzzy-alpaca is a **standalone automated-trading system**. The service built so far is *component
one* of that system — the broker gateway. This document defines the whole-system shape and how
its parts relate. The gateway's own internal design is in [architecture.md](architecture.md); how
an orchestrator should drive the gateway API is in [orchestration-guide.md](orchestration-guide.md).

## Relationship to `h`: reference, not integration

`h` is a general-purpose, tried-and-tested Dapr-Workflows harness — a lab/tool for making code
changes across repos (it could even be pointed at *this* repo). It is **not** the trading
orchestrator and this system does **not** integrate with or depend on it. fuzzy-alpaca is a
different use case with a different lifecycle (money-path production infrastructure vs. a
general agent harness).

What we take from `h` is **patterns**: it is a proven reference for a Dapr-Workflows system —
workflow-as-data with an activity registry, the MCP-server skeleton (Fastify + MCP SDK + Effect,
SSE), Dapr state/pub-sub components, and the docker-compose/k8s + sidecar wiring. We borrow the
scaffolding shapes; we build our own use-case-specific system.

## System components

| Component | Role | Status |
|---|---|---|
| **Gateway** (this service) | Stateless broker adapter: typed, idempotent, safe access to Alpaca (equities + crypto) | ✅ built, live-verified, containerized |
| **Orchestrator** | Dapr Workflows sequencing trading loops (bootstrap → signal → decide → execute → poll → journal) | to build |
| **Intelligence** | Signals (quant) → decision/risk (deterministic) → agents (research/review) | to build, incremental |
| **State** | Postgres via a Dapr state component: bars cache, decisions journal, orders mirror | to build |
| **Agent tools (MCP)** | Curated trading toolset exposed to reasoning agents | to build |
| **Deployment** | compose/k8s stack with Dapr sidecars, referencing `h`'s wiring | partial (gateway image done) |

## The execution model (holds regardless of `h`)

The dangerous/deterministic path and the reasoning path are deliberately separated — *agents
propose and explain; deterministic steps execute*:

- **Agents** reach the gateway through a **curated MCP toolset** (read-heavy: market data,
  account, positions). They never get raw order placement.
- **Deterministic workflow activities** do execution (place → poll → record). This is the only
  place order placement belongs, because of the idempotency handshake:

  > A Dapr workflow gives each instance a stable id and each activity a deterministic name. Derive
  > `clientOrderId = {workflowInstanceId}-{activityName}`. Dapr activities are at-least-once, so on
  > replay the activity re-sends the **same** key and the gateway returns the existing order
  > (`idempotentReplay: true`) instead of double-placing. The double-order-on-retry failure becomes
  > structurally impossible. An agent calling an MCP tool has no such stable step identity — so
  > execution cannot live in the agent path.

On a retryable `503` from `POST /v1/orders`, the activity re-sends the same `clientOrderId`; the
gateway has already reconciled whether the first attempt landed.

## State: gateway stateless, orchestration owns the store

The gateway holds no trading state by design. The **orchestrator** owns the store:

- **Dapr state component backed by Postgres** (reference `h`'s `statestore` shape; use
  `state.postgresql` rather than Redis). Bars cache is a **read-through**: workflow checks Dapr
  state → miss → calls the gateway's `/v1/market-data/:symbol/bars` → writes the immutable bars
  back. That is where the rate-limit savings come from.
- **KV vs SQL nuance:** Dapr state is key-value (get/getBulk/limited query) — fine for the bars
  cache and orders mirror. The **decisions journal** wants relational joins (decisions → orders →
  realized P&L, to evaluate whether the intelligence adds value) — query that via **direct SQL**
  against the same Postgres. One database, two access paths.

## Order-fill events

The MVP polls fills, which stays the source of truth. Event fan-out (if added) is an
orchestrator concern on its own Dapr pub/sub — the gateway stays transport-agnostic and never
publishes into a mesh itself.

## Repo/system shape (open decision)

The gateway currently lives as a single-service repo. Growing into a multi-component system means
either evolving this repo into a monorepo (gateway + orchestrator + mcp + shared, one deploy
stack — mirroring `h`'s proven layout) or splitting components across repos. That structural
choice is recorded in the phase plan under `docs/plans/` when the build begins.
