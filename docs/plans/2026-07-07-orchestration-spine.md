# Phase A — Orchestration spine (walking skeleton)

Turn the standalone gateway into the start of a system: a monorepo, and a Python Dapr-Workflows
orchestrator that drives the gateway through one real paper-trade lifecycle with Postgres-backed
Dapr state. Proves the two hardest things at once — the idempotency handshake and the state store.
Decisions taken: monorepo (evolve this repo), Python-first orchestrator + intelligence. `h` is a
reference for Dapr patterns, not a dependency. See [system-architecture.md](../system-architecture.md).

## Progress

| Milestone | Status | Notes |
|---|---|---|
| 1. Monorepo restructure (gateway → apps/gateway) | ⬜ | gateway stays green from new location |
| 2. Python orchestrator + Dapr + Postgres scaffold | ⬜ | uv app, gateway client, dapr components, compose stack |
| 3. Walking-skeleton workflow + idempotency proof | ⬜ | place→poll→journal; force retry → idempotentReplay:true |

## Target layout

```
fuzzy-alpaca/
├── apps/
│   ├── gateway/        # the Effect-TS broker gateway (moved from repo root)
│   └── orchestrator/   # NEW — Python, Dapr Workflows (uv project)
│       ├── src/orchestrator/
│       │   ├── workflows/       # trade_lifecycle workflow
│       │   ├── activities/      # place_order, poll_fill, journal (deterministic)
│       │   ├── gateway_client.py   # typed httpx client for the gateway API
│       │   └── app.py           # FastAPI + Dapr Workflow runtime host
│       └── pyproject.toml
├── dapr/               # Dapr component YAMLs (statestore=postgresql, pubsub)
├── docs/               # system docs (unchanged, at root)
├── docker-compose.yml  # gateway + orchestrator + dapr sidecars + postgres
└── CLAUDE.md           # at root
```

## Milestone 1 — monorepo restructure

Move gateway sources (`src/`, `test/`, `scripts/`, `package.json`, `package-lock.json`,
`tsconfig.json`, `vitest.config.ts`, `eslint.config.js`, `Dockerfile`, `.dockerignore`,
`.env.example`) under `apps/gateway/`. Keep `docs/`, `CLAUDE.md`, `README.md`, `.gitignore`,
`.github/` at root. Update CI to run in `apps/gateway`, and the gateway Dockerfile build-context
notes. **DoD:** from `apps/gateway/`, `npm run typecheck && npm test && npm run lint` green and
`docker build` succeeds; the real `.env` moved alongside so `npm run smoke` still works.

## Milestone 2 — orchestrator scaffold

Functional style (Effect-flavoured): pure `Result`-returning core, effects at the edges; pragmatic
flat hex. See CLAUDE.md conventions.

- `apps/orchestrator` uv project: `dapr`, `dapr-ext-workflow`, `fastapi`, `uvicorn`, `httpx`,
  `pydantic`, `returns`; dev `pytest`, `ruff`, `mypy`.
- **domain** — frozen models (`PlaceOrder`, `Order`, `GatewayError`) + pure helpers
  (`client_order_id(instance_id, step) -> str`) returning `Result`.
- **infrastructure gateway client** — `httpx` calls returning `Result[Order, GatewayError]`,
  reading the gateway's error envelope + `retryable` flag; no exceptions escape into the core.
- **dapr/** components: `statestore` (`state.postgresql`, pointed at the compose Postgres) and
  `pubsub` (redis, for later) — shapes referenced from `h/dapr`.
- **docker-compose.yml** — gateway, orchestrator + its daprd sidecar, postgres, placement.
  **DoD:** `docker compose up` brings the stack healthy; orchestrator can reach the gateway and
  read/write Dapr state.

## Milestone 3 — walking-skeleton workflow

`trade_lifecycle(symbol, side, notional)`:
1. `bootstrap` activity — gateway `/health` + `/v1/account`; assert `tradingMode == paper`.
2. `snapshot` activity — read latest price (also demonstrates the bars-cache read-through later).
3. `place` activity — `clientOrderId = f"{workflow_instance_id}-place"`; POST order. **Deterministic
   identity is the whole point**: a replayed activity re-sends the same id.
4. `poll_fill` activity — poll `/v1/orders/:id` with expanding backoff until terminal.
5. `journal` activity — write an `orders_mirror` + `decisions` row (Dapr state KV for the mirror;
   SQL for the journal).

**DoD (the proof):** run against the paper account (crypto BTC/USD so it fills 24/7); then force
an activity retry and observe the second attempt return `idempotentReplay: true` with the *same*
order id — the double-order-on-retry failure demonstrated impossible end-to-end.

## Non-goals for Phase A

No real strategy/signals (Phase B), no agents/MCP (Phase C), no k8s (Phase D). The skeleton
places a trivial, safe order purely to exercise the spine.
