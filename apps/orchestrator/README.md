# orchestrator

The **orchestrator** — the deterministic trading loops and the **strategy intelligence** of the
fuzzy-alpaca system (see [../../docs/system-architecture.md](../../docs/system-architecture.md)).
Dapr Workflows execute against the gateway; a pure signal/decision/risk core proposes, and a
walk-forward **gate** decides whether a strategy is allowed anywhere near the money path. How it
consumes the gateway and where the intelligence sits:
[../../docs/orchestration-guide.md](../../docs/orchestration-guide.md).

Python, hexagonal, functional: pure core over immutable data, `returns.Result` at the edges, I/O
only in `infrastructure/`. Toolchain is **uv** (no pip/poetry).

## Quick start

```sh
cd apps/orchestrator
uv sync
uv run pytest              # offline, deterministic — pure core, no gateway needed
uv run ruff check src scripts tests && uv run mypy --strict src scripts
```

The research scripts need a running gateway (see [`../gateway`](../gateway)) for real bars:

```sh
GATEWAY_URL=http://localhost:3001 SERVICE_API_KEY=dev-service-key \
  uv run python scripts/sweep.py
```

## Strategy research harness

The heart of the [research loop](../../README.md#how-we-find-edge--the-research-loop). All three
scripts reuse the *same* pure evaluation machinery the live workflow uses, so a research pass and a
live decision agree by construction. The walk-forward gate is the arbiter; read the running log of
what we've tried (and refuted) in [../../docs/experiments.md](../../docs/experiments.md), which
links one detailed file per experiment under `docs/experiments/`.

| Script | Purpose |
|---|---|
| `scripts/backtest.py` | Single strategy × symbol × timeframe over real bars; optional persist |
| `scripts/sweep.py` | Grid of (strategy, params) × symbol × timeframe through the walk-forward gate — reports what (if anything) passes, with a multiple-testing caveat |
| `scripts/portfolio.py` | Equal-weight / risk-parity **basket** of one strategy across a universe, gated as a portfolio |
| `scripts/agent_verify.py`, `scripts/mcp_verify.py` | Exercise the research agent and its read-only MCP tool surface |

Key modules:

- `application/signals.py` — pure strategy functions `list[Bar] → Signal` (price, channel,
  volatility, volume). Registered in `STRATEGIES`.
- `application/backtest.py`, `walkforward.py` — the pure engine and out-of-sample walk-forward
  (incl. `portfolio_walk_forward` for baskets).
- `application/sizing.py` — position sizing / volatility targeting (default all-in; research-only,
  never touches live order safety).
- `domain/gate.py` + `application/gate.py` — the pass/block contract. Default is strict: **block**.

## Safety

Order mutations are never retried or resubmitted server-side (idempotency via `clientOrderId`);
money is validated decimal strings, never floats; paper mode by default. The gate is **binding** —
`strategy_tick` refuses to place for any strategy that does not clear it. See
[../../.claude/conventions.md](../../.claude/conventions.md).
