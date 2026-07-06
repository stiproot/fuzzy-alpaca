# Integrating fuzzy-alpaca-core with the `h` orchestrator

How this service plugs into `h` — a Dapr-Workflows agent-orchestration harness where agents
construct and monitor workflows. This document is the integration contract and the boundary
decision behind it. Companion: [orchestration-guide.md](orchestration-guide.md) (the general
"how orchestrators consume this API" guidance this specializes).

## Boundary decision: fuzzy-alpaca-core stays a standalone repo

**Recommendation: keep this service as its own repo; do NOT fold it into the `h` monorepo.**

`h` is explicitly "a lab for experimenting with AI agent frameworks" — a tightly-coupled monorepo
(npm + uv workspaces; every app depends on shared `logger` / `telemetry` / `core-dapr` /
`agent-server` packages via `workspace:*`). This service is the opposite kind of thing: a bounded
broker gateway on the **money path**, whose entire value is being stable, boring, independently
deployable, and independently auditable. Coupling its release cadence and blast radius to an
experimental agent lab would dilute exactly the property that makes it worth having.

`h` already contains the precedent for the clean alternative: **`obs-mcp`** is a pure-HTTP service
in the mesh with *no Dapr sidecar* and no dependency on the agent machinery. Our integration
follows that spirit — `h` reaches into this service over its REST/OpenAPI contract, and nothing
in this repo takes a dependency on `h`.

The glue lives on the `h` side (two thin pieces below), depending on this service only through
its published `openapi.json`.

## The two-glue-piece model

This maps directly onto the intelligence-layer split from the orchestration guide — *agents
propose and explain; deterministic steps execute* — and onto two patterns `h` already has.

### Glue 1 — `trading-mcp` (agent-facing, lives in `h`)

A thin MCP server following the existing `workflow-mcp` / `dapr-mcp` skeleton (Fastify +
`@modelcontextprotocol/sdk` + Effect, SSE transport, registered in `.mcp.json`). Its infra
adapter is an Effect `HttpClient` pointed at this service's base URL — no Dapr sidecar on our
side (the `obs-mcp` no-sidecar precedent).

It exposes a **curated, read-heavy** toolset to reasoning agents: market data
(quote/trade/snapshot/bars), account, positions, asset lookup, calendar/clock. This is what an
analyst/research agent calls during a reasoning loop.

**It should NOT expose raw `POST /v1/orders` to free agent judgement.** Order placement is not a
reasoning step — see Glue 2. If agents need to influence trades, give them a *propose-order* tool
that writes an intent to state; the deterministic activity decides and executes.

### Glue 2 — a `trading` workflow activity (deterministic execution, lives in `h`'s `workflow-svc`)

For the safety-critical path — place order, poll fill, record — add an activity to
`workflow-svc`'s registry that calls this service's REST directly via `HttpClient`. This is a
**new pattern for `h`** (its activities currently only invoke agents via Dapr service invocation
or do local FS work) and must be introduced deliberately. It is the right place for it, because
of the crown-jewel reason:

> **The idempotency handshake wants the deterministic workflow activity, not the agent MCP path.**

A Dapr workflow gives each instance a stable id and each activity a deterministic name/sequence.
Derive `clientOrderId = {workflowInstanceId}-{activityName}`. Dapr activities are *at-least-once*
— on replay/retry, the activity re-runs, re-sends the **same** `clientOrderId`, and this service
returns the existing order with `idempotentReplay: true` instead of double-placing. This makes
the single most dangerous failure in automated trading — a double-order on retry — structurally
impossible. An agent calling an MCP tool has no such stable step identity; only the activity
does. So execution belongs in the activity, full stop.

On a retryable `503` from `POST /v1/orders`, the activity re-sends the same `clientOrderId` (the
response says so); the server has already reconciled whether the first attempt landed.

## State store: Dapr state, Postgres-backed, owned by `h`

Trading state (bars cache, decisions journal, orders mirror) is **orchestrator state, not gateway
state** — this service stays stateless by design. The store lives in `h`.

- **Align on Dapr state** (matches `h`'s existing `statestore` component and its deliberately
  shared, cross-service-readable keyspace). Today `h` uses a Redis backend; add a **`state.postgresql`
  Dapr component** to honour the Postgres preference — Dapr state is pluggable, so this is a
  component swap, not a code change on consumers.
- **Bars cache = read-through in `h`**: a workflow step checks Dapr state → on miss calls this
  service's `/v1/market-data/:symbol/bars` → writes the (immutable) bars back. This is where the
  rate-limit savings come from; this service just serves the miss.
- **Nuance worth designing around:** Dapr's state API is key-value (get / getBulk / limited
  query). That fits the bars cache and orders mirror (keyed lookups) well. The **decisions
  journal** wants relational queries (join decisions → orders → realized P&L for evaluation), which
  the KV interface serves poorly — point analytics at the **same Postgres directly via SQL**, and
  reserve the Dapr state API for the KV-shaped access. One database, two access paths.

## Order-fill events: keep the gateway protocol-agnostic

`h` uses Redis-backed Dapr pub/sub, but this service publishing directly into it would couple the
money-path gateway to `h`'s Redis/network — avoid. The MVP already polls fills. Keep the poll as
the source of truth; if push is added later, a small receiver **in `h`** republishes onto Dapr
pub/sub. This service stays unaware of `h`'s transport.

## What lives where

| Piece | Repo | Status |
|---|---|---|
| Broker gateway (this service) | `fuzzy-alpaca` (standalone) | Built, live-verified |
| Container image | `fuzzy-alpaca` | Done — `Dockerfile`, boots + serves `/health` |
| `trading-mcp` (agent tools) | `h` (new app, `obs-mcp`/`dapr-mcp` skeleton) | To build |
| `trading` activity (deterministic exec) | `h` (`workflow-svc` registry) | To build — new direct-HTTP-activity pattern |
| Postgres Dapr state component + read-through | `h` | To build |
| Bars cache / decisions journal / orders mirror | `h` (Dapr state + SQL) | To build |
| Order-fill event fan-out | `h` (if/when push added) | Deferred |

## Deployment shape

This service runs as a plain HTTP container that `h` calls into — no Dapr sidecar required (it
needs neither Dapr state, pub/sub, nor service invocation itself). Config is read once at boot
from the environment (`h`'s secret store / k8s env / compose env); there is no `--env-file` in the
container. If it is ever co-located in `h`'s compose/k8s, it slots in as a sidecar-less service
block like `obs-mcp`, with `trading-mcp`'s adapter and the `trading` activity pointed at its
base URL.
