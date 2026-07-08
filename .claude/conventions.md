# How we build here

Steering for anyone — human or agent — building in this repo. Minimal by intent; we iterate.

## Style — functional, Effect-flavoured

- **Pure core, effects at the edges.** Business logic is pure functions over immutable data;
  I/O (HTTP, DB, Dapr) lives only in adapters.
- **Errors are values, not exceptions.** TS: Effect's typed `E` channel. Python: `returns.Result`
  (`Success`/`Failure`) — no exception-driven control flow in the core; adapters catch and map
  into `Result`.
- **Immutable data.** TS: `Schema`/readonly. Python: frozen pydantic (`frozen=True`) / frozen
  dataclasses. No mutable shared state.
- Plain serializable data crosses process/Dapr boundaries; the `Result`/Effect wrapper stays
  inside the composition (like Effect emitting plain JSON at the HTTP edge).

## Structure — pragmatic hexagonal

- Every service is hexagonal: `domain` → `application` → `infrastructure`/`presentation`, with
  ports (interfaces) at the boundary and adapters implementing them.
- **Flat layout** (per `h`): those layers sit one level deep under `src/` as files, plus a
  composition-root entrypoint. Don't nest deeply (the gateway's older
  `adapters/inbound/http/groups/...` tree is legacy, not the pattern to copy).
- Dependencies point inward; `domain` imports nothing outward. Where lint can enforce it, it does
  — don't weaken the rules to get around them.

## Toolchain — Bun + uv (locked in, matching `h`)

- **JS/TS: Bun.** `bun install`, `bun run <script>`; Bun runs TS directly (no tsx/ts-node);
  Dockerfiles on `oven/bun`. No npm/yarn/pnpm.
- **Python: uv.** `uv sync`, `uv run <tool>`; `uv.lock` committed. No pip/poetry.
- Lint/type-check clean is the bar: TS `tsc` + eslint; Python `ruff` + `mypy --strict`.

## Safety (money path)

- Order mutations are **never** retried or resubmitted server-side; ambiguity is reconciled by
  `clientOrderId`. Idempotency keys are derived deterministically (workflow instance + step).
- Money values stay validated decimal strings — **never** floats.
- Paper mode by default; assert `tradingMode` before acting.

## Working rhythm

- **Plan doc per substantial task** at `docs/plans/YYYY-MM-DD-<slug>.md` — a transient change log
  (design, Progress table, "deltas from plan"). On completion, extract durable knowledge to the
  permanent docs (`docs/architecture.md`, `docs/system-architecture.md`, `README`, this steering)
  and mark the plan historical. Never cite a plan as current truth.
- **Verify against reality**, not just tests — drive the affected flow (paper account, live stack)
  where possible.
- **Commit + push at milestone boundaries**, with the plan's Progress table updated.

## Strategy research loop

Finding edge is empirical, and honesty is the whole game. Every strategy idea goes through one
loop — **research → document → experiment → validate → document**:

1. **Research** — form one falsifiable hypothesis (a strategy/param/universe idea, from a human or
   the research agent). Change one variable at a time.
2. **Document** — write the hypothesis + method into `docs/experiments.md` *before* running, so the
   result can't be rationalized after the fact.
3. **Experiment** — run it through the shared harness (`scripts/sweep.py`, `scripts/backtest.py`,
   `scripts/portfolio.py`), never a bespoke one-off — a research pass and a live decision must agree
   by construction.
4. **Validate** — the walk-forward **gate** is the arbiter (out-of-sample Sharpe/return/drawdown/
   folds). A pass on one window is a *hypothesis, not an edge*; confirm on data — a symbol, a
   universe, a window — it was **not** selected on. Assume multiple-testing: try N things and a few
   look good by luck.
5. **Document** — write result → conclusion → improvement → next hypothesis back into
   `docs/experiments.md`. **Log failures and refutations, not just wins** — a killed mirage is a
   result. Fold any lesson back into the harness so the next cycle can't repeat the mistake.

The gate is binding on the money path: an unproven strategy never trades. Never weaken it, cherry-pick
a passing config, or present a single-name/single-window pass as a proven edge.
