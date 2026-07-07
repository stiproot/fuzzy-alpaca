# fuzzy-alpaca-core — project conventions

Effect-TS hexagonal service wrapping Alpaca for an agent workflow orchestrator.

## Where truth lives

- `docs/architecture.md` — the as-built blueprint (layers, call recipes, error contract, safety
  stances). Read this before changing structure.
- `README.md` — API surface, runbook, env vars, scripts.
- `openapi.json` (`npm run openapi`) — the authoritative wire contract.
- `docs/orchestration-guide.md` — how the (external) orchestrator should consume this API:
  usage playbook, Postgres state-store design, intelligence-layer shape, guardrails.
- `docs/system-architecture.md` — the whole standalone-system shape (gateway = component one;
  orchestrator, intelligence, state, MCP to build). `h` is a *reference* for Dapr patterns, not
  an integration target. Holds the agents-propose/deterministic-execute model and where the
  idempotency handshake lives.
- `docs/concepts/` — plain-language explainers (e.g. trading basics) for humans new to the domain.
- `docs/plans/` — historical plan documents only (see workflow below). Never current truth.

## Plan-document workflow

Every substantial task (feature, migration, redesign) gets a plan document:

1. **Create** it at `docs/plans/YYYY-MM-DD-<task-slug>.md` before implementation starts.
2. **Treat it as transient**: a plan is a detailed change log for its task — design, milestones,
   a Progress table, and "deltas from plan" recording where reality diverged. Keep it updated as
   milestones complete.
3. **Extract on completion** (or as soon as something becomes durable): long-living context moves
   OUT of the plan into its permanent home —
   - architecture/design truths → `docs/architecture.md`
   - operational or user-facing info → `README.md`
   - conventions and workflow rules for future sessions → this `CLAUDE.md`
4. **Mark it historical**: finished plans get a header note stating the task is complete and
   pointing to the permanent docs.
5. **Never** cite a plan doc as the source of current behavior — read the permanent docs and the
   code; plans exist for archaeology ("why is it like this?").

## Engineering conventions

- **Toolchain is locked in (matching `h`): Bun for JS/TS, uv for Python.** No npm/yarn/pnpm, no
  pip/poetry. Gateway: `bun install`, `bun run <script>`, Bun runs TS directly (no tsx/ts-node),
  Dockerfile on `oven/bun`. Python services: `uv sync`, `uv run <tool>`, `uv.lock` committed.
- **Functional-programming style, Effect-flavoured, in every service.** Gateway: Effect-TS.
  Python services: an immutable, `Result`-typed **pure core with effects at the edges** — pure
  functions in `domain`/`application` returning `returns.result.Result` (the typed error channel,
  like Effect's `E`); frozen models (`pydantic` `frozen=True` / frozen dataclasses); side effects
  (HTTP, Dapr, DB) confined to `infrastructure` adapters that catch and map into `Result`. No
  mutable shared state, no exception-driven control flow in the core. Plain serializable data
  crosses the Dapr activity boundary (Result stays inside the pure composition, like Effect emits
  plain JSON at the HTTP edge).
- **Pragmatic hexagonal layout** (per `h`'s services, to avoid deep nesting): a service's `src/`
  has flat top-level layers — `domain/`, `application/`, `infrastructure/`, `presentation/` — as
  files, plus a composition-root entrypoint. Do NOT recreate the gateway's deep
  `adapters/inbound/http/groups/...` tree in new services; keep layers one level deep.
- Follow the effect-claude-primitives plugin skills for Effect idioms; load the relevant skill
  before writing Effect code in an unfamiliar area.
- Hexagonal dependency rule and the Alpaca-SDK import quarantine are lint-enforced — do not
  weaken `eslint.config.js` to get around them; go through the `AlpacaClient` port.
- Order mutations are NEVER retried or resubmitted server-side (see architecture doc,
  "Order safety") — any change to the order write path must preserve this.
- Trading-API money values stay validated decimal strings; never convert to floats.
- Commit at milestone/phase boundaries with the plan's Progress table updated; push after commit.
- Verify milestones against the live paper account via `npm run smoke` where possible (needs
  `.env`; never wired into CI; must stay read-only on real positions).
