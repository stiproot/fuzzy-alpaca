# Orchestration & Intelligence Guide

How to build an effective agent-driven trading workflow **on top of** fuzzy-alpaca-core. This is
context for the orchestrator (which lives in its own repo — we do not build it here): how systems
like it consume APIs like ours, what state they should persist and where, and what shape the
intelligence layer should take. Companion docs: [architecture.md](architecture.md) (what this
service guarantees), [concepts/trading-basics.md](concepts/trading-basics.md) (domain language).

> Currency note (written 2026-07): OSS project assessments reflect knowledge through early 2026.
> Before adopting any specific library, re-verify it is maintained; the *categories and roles*
> below change far more slowly than the projects filling them.

---

## 1. How orchestration frameworks consume an API like this

### The contract is the integration

This service was built machine-first precisely so an orchestrator can treat it as a **typed tool
box**, not a web page:

- **Codegen from `openapi.json`** — the CI-published spec is the source of truth. Generate a
  typed client (or LLM tool definitions) from it; never hand-write request shapes. Every schema
  is strict, so a drifting client fails fast at our 400 rather than corrupting an order.
- **Tools for LLM agents** — the modern pattern is to wrap each endpoint (or a curated subset)
  as a tool: either OpenAPI→tool-definition generation, or an **MCP server** fronting the API so
  any MCP-capable agent can call it. Curate rather than exposing everything: an analysis agent
  gets read-only market-data tools; only the execution step gets `POST /v1/orders`.
- **Error codes are branch points** — every non-2xx is `{ error: { code, retryable, ... } }`.
  The orchestrator's retry policy should be *mechanical*: `retryable: true` → backoff and retry
  (honoring `details.retryAfterSeconds` on 429); `retryable: false` → do not retry, route to a
  decision (400/422 → the request was wrong, rethink; 404 → state assumption stale, re-read).
- **Correlation** — send an `x-request-id` derived from the workflow run + step id; it threads
  through our logs/spans, making cross-system debugging one join key.

### Durable execution around trades

Order placement is a side effect inside a workflow, and every serious framework (Temporal, Dapr
Workflows, LangGraph with checkpointing) treats it the same way:

- **Idempotency key = deterministic step identity.** Derive `clientOrderId` from
  `{workflowInstanceId}-{stepName}` (≤48 chars). A replayed/retried workflow step then *cannot*
  double-order: this API returns the existing order with `idempotentReplay: true`. This is the
  single most important integration rule.
- **On retryable 503 from `POST /v1/orders`**: re-send the *same* `clientOrderId` (the response
  message says exactly this). The server has already reconciled whether the first attempt
  landed; the agent never has to guess.
- **Fills are polled, not pushed** (no webhooks in the MVP): after placing, poll
  `GET /v1/orders/:id` with expanding intervals (1s, 2s, 5s, then per-minute for resting limit
  orders). Market crypto orders fill in seconds; resting equity limits can take hours — park
  them and poll on a schedule rather than holding a workflow open hot.
- **Compensation (saga) pattern**: the compensating action for an unwanted fill is a closing
  order, not a cancel — model "undo" explicitly in the workflow, and confirm cancel results by
  reading the returned order status (cancel of an already-filled order 409s).

### Budgeting the rate limit

Alpaca allows ~200 req/min and this service retries reads up to 3× internally. Practical
allocation for a small fleet: give the execution path an uncontended reserve (~50/min), meter
market-data scanning to what remains, and centralize the budget in one token bucket owned by the
orchestrator (Redis or in-process if single-node). The cheapest request is the one the state
store answers instead (see §3).

---

## 2. API usage playbook

Patterns that make a workflow cheap, fast, and safe against this specific API:

- **Session bootstrap (once per run):** `GET /health` (assert `tradingMode` is what you think it
  is — a live-mode surprise must abort), `GET /v1/account` (buying power, blocked flags),
  `GET /v1/clock` + `GET /v1/calendar` (equities gating; irrelevant for crypto).
- **Prefer `snapshot` over quote+trade+bars:** one call returns latest quote, latest trade, and
  the minute/daily/prev-daily bars — it answers "what is this symbol doing right now" for one
  request. Use `quote` alone only when you need just the spread.
- **Bars are for history; fetch once, store forever.** Closed bars never change (equities:
  splits/dividends via `adjustment` are the exception — store raw + adjustment used). Page with
  `nextPageToken` until drained into the state store; thereafter only fetch the tail.
- **Check the asset before ordering** — `tradable`, `fractionable`, `shortable`, and for crypto
  `minOrderSize` (and the ≥$10 practical minimum). Our service pre-checks tradability too, but
  the agent avoiding a doomed request saves budget and latency.
- **Sizing goes through `GET /v1/account` immediately before ordering** — never a cached buying
  power. Positions and account are the two things that must always be read fresh (they are the
  broker's truth, cheap to read, and stale copies cause real-money mistakes).
- **Watch order state through the list endpoint** when tracking several orders:
  `GET /v1/orders?status=open` is one request for the whole book vs N by-id polls.
- **Use replace, not cancel+create, to adjust a resting limit order** — atomic on the broker
  side and keeps the audit chain linked (`replacesOrderId`).
- **Equities after hours:** orders queue (`accepted`) rather than fill. A workflow that expects
  a fill should first consult the clock and either wait for `nextOpen` or use `extendedHours`
  limit orders deliberately.
- **Crypto never sleeps:** a crypto loop needs its own halt conditions (drawdown, spend caps)
  because there is no closing bell to bound a runaway strategy — see §5 kill switches.

---

## 3. State store: Postgres first

**Recommendation: Postgres as the system of record and the cache. Add Redis only when a
measured need appears.** Placement: the store belongs to the orchestrator/intelligence side;
fuzzy-alpaca-core stays a stateless gateway (a read-through bars cache inside the gateway is a
possible later extension, but it changes this service's ops profile — don't start there).

Why Postgres over Redis for the primary store:

- The bulkiest, highest-value cache is **historical bars — immutable once closed**. Immutable
  time-series wants durable, indexed, queryable storage (backtests do range scans and joins),
  which is Postgres territory. Cache invalidation — the hard problem — mostly disappears when
  the cached thing cannot change.
- The intelligence layer needs a **decision journal, order mirror, strategy state, and backtest
  results** anyway — relational, durable, joinable. One store doing both beats two stores.
- Redis's strengths (sub-ms hot keys, TTL expiry, distributed primitives) matter for
  *ephemeral* data — but the ephemeral data here (quotes) is so cheap to re-fetch and so
  quickly stale that caching it is usually a mistake. When a genuine need arrives (many
  concurrent workflows sharing a rate-limit token bucket, or sub-second quote fan-out), add
  Redis for exactly that, beside Postgres, not instead of it.

### What to store (and what never to cache)

| Data | Freshness rule | Store |
|---|---|---|
| Bars (closed) | Immutable — fetch once, keep forever | Postgres `bars` (consider TimescaleDB if volume grows) |
| Assets universe | Refresh daily; tradability can flip intraday for halts — re-check per-order | Postgres `assets`, `fetched_at` column |
| Calendar | Static weeks ahead; refresh weekly | Postgres `calendar_days` |
| Snapshots/quotes/trades | **Do not cache** beyond the current decision cycle (seconds) | in-memory per run only |
| Account (buying power, equity) | **Never cache** for sizing; read before every order | — |
| Positions | **Never cache** for decisions; mirror *after* mutations for the journal | Postgres `position_snapshots` (history, not cache) |
| Orders | Broker is truth; mirror every response for audit/analytics | Postgres `orders_mirror` |
| Decisions | Ours, not Alpaca's: signal inputs, rationale, chosen action, outcome | Postgres `decisions` |
| Strategy state | Cursors, regime flags, cooldowns, per-strategy capital | Postgres `strategy_state` |
| Backtest runs | Config + metrics + artifact pointers | Postgres `backtests` |

Sketch of the core tables:

```sql
bars(symbol, timeframe, ts, open, high, low, close, volume, trade_count, vwap,
     adjustment, primary key (symbol, timeframe, adjustment, ts));
orders_mirror(order_id uuid pk, client_order_id, symbol, side, type, status, payload jsonb,
     workflow_run, recorded_at);
decisions(id, ts, strategy, symbol, action, inputs jsonb, rationale text,
     order_id nullable, outcome jsonb nullable);
strategy_state(strategy pk, state jsonb, updated_at);
```

The `decisions` table is the most important one long-term: it is what lets you evaluate whether
the intelligence layer is actually adding value (join decisions → orders → realized P&L).

---

## 4. The intelligence layer

Shape: **three tiers with a hard boundary between "thinking" and "acting"**. LLM agents
upstream, deterministic math in the middle, and this API at the bottom behind guardrails. The
consistent practitioner finding (through early 2026) is that LLMs add value in *research
synthesis, regime interpretation, and anomaly explanation* — and underperform classical quant
at *systematic signal generation, position sizing, and execution*. Architect accordingly: the
LLM proposes and explains; the math disposes; the workflow executes.

### Tier 1 — Signals (classical quant, OSS)

Deterministic, backtestable signal generation over cached bars:

| Role | OSS candidates (verify liveness before adopting) | Notes |
|---|---|---|
| Technical features | TA-Lib (C lib, stable); pandas-ta or successors | Momentum, RSI, ATR, moving averages — the vocabulary of tier-1 signals |
| Quant ML platform | Microsoft **Qlib** | Factor/ML pipelines, mature; heavyweight but proven |
| RL for trading | **FinRL** | Academic-strength; treat live use skeptically, good for research |
| Vectorized backtesting | **vectorbt** | Fast research iteration over the Postgres bars |
| Event-driven backtest/live parity | **nautilus_trader**, QuantConnect **Lean** | Same code backtest→live; heavier adoption cost |
| TS foundation models | Amazon **Chronos**, Google **TimesFM**, Salesforce **Moirai** | Zero-shot forecasters; honest take: weak edge on raw prices, more useful for **volatility/volume** forecasts feeding the risk tier |
| Sentiment | **FinBERT** (cheap, reliable classifier); FinGPT-class models | Feed news/social scores as a *feature*, not a trade trigger |

Signals are pure functions: `bars + features → score per symbol`. They run on the state store,
not against the API.

### Tier 2 — Decision & risk (deterministic frameworks, no LLM)

The math that turns scores into orders. This tier is non-negotiable code, not agent judgment:

- **Position sizing:** fractional Kelly (¼–½ Kelly; full Kelly over-bets under estimation
  error) or **volatility targeting** (size ∝ target-vol / realized-vol) with a
  **fixed-fractional cap** (risk ≤ 1–2% of equity per position via ATR-based stop distance).
- **Portfolio constraints:** max positions, per-symbol and per-sector exposure caps,
  correlation-aware concentration limits. Libraries: riskfolio-lib / PyPortfolioOpt-lineage /
  skfolio for allocation; empyrical-style metrics for monitoring.
- **Drawdown governor:** halt new entries at X% peak-to-trough (e.g. 10%), flatten at Y%
  (e.g. 15%). This is the one control that saves an automated book.
- **Regime filter:** a simple trend/chop/vol-state classifier (moving-average slope + realized
  vol bucket is enough to start) that switches strategies on/off. LLMs may *propose* a regime
  read; the filter that gates orders is computed.
- **Crypto adjustments:** fee-aware sizing (taker fees deduct from the credited asset —
  a round trip costs ~0.4–0.5% at entry tiers, so signals must clear that hurdle), min-order
  floors ($10 practical), and 24/7 loops need time-based risk resets instead of daily closes.

### Tier 3 — Agents (LLM layer)

Where agents genuinely earn their place:

- **Research synthesis:** digest filings/news/sentiment into a structured thesis per symbol,
  written to the decision journal. (The multi-agent "analyst / bull / bear / risk / trader"
  debate structure from the TradingAgents line of work is a reusable *role design* even if you
  adopt none of the framework code — its measurable value is in forcing an adversarial review
  before a proposal survives. Verify the current state of these frameworks before borrowing.)
- **Regime narration & anomaly triage:** explain *why* the regime filter flipped, interpret a
  spike, decide whether an unexpected 422 pattern means an assumption broke.
- **Strategy proposal, not strategy execution:** an agent may propose "momentum on, mean-revert
  off, tilt crypto weight down" — as a *parameter change* that tier 2 validates against
  constraints and the journal records. An agent never computes an order quantity.
- **Post-trade review:** periodic agent pass over `decisions ⋈ outcomes` producing a critique —
  the cheapest alpha in the whole system is discovering a strategy is quietly broken.

### Non-negotiable guardrails (enforced in the orchestrator, backstopped here)

1. Assert `tradingMode` at workflow start; refuse to run a strategy tagged paper-only against live.
2. Every order carries a workflow-derived `clientOrderId`; on retryable errors re-send the same one.
3. Spend caps: per-order (our `MAX_ORDER_NOTIONAL`/`MAX_ORDER_QTY` env rails — set them), per-day, per-strategy.
4. Drawdown halt + a manual kill switch (cancel-all + flatten is two API calls: `DELETE /v1/orders?confirm=true`, then close positions).
5. Symbol allowlist per strategy; anything else is rejected before the API is called.
6. Human approval gate for: going live, raising caps, first N live trades of any new strategy.
7. Never trade on a cached account/position read.

---

## 5. Validation pipeline (how a strategy earns capital)

```
backtest (vectorbt over Postgres bars, incl. fees/slippage)
  → walk-forward / out-of-sample (guard against overfit; distrust in-sample Sharpe)
    → paper trading via this API, tradingMode=paper (weeks, not days; crypto compresses this)
      → limited live capital under tight caps (canary)
        → scale only on journal evidence (realized vs backtested edge within tolerance)
```

Paper trading through this exact API (same contract, same errors, same fills semantics) is the
orchestra's rehearsal room — the MVP was deliberately built paper-first for this reason. The
decision journal makes each gate measurable instead of vibes-based.

---

## 6. Reference workflow shapes

**Daily equities loop** (cron at `nextOpen − 30m`):
sync calendar/clock → refresh assets → pull bar tails into Postgres → tier-1 signals →
tier-3 research pass on top-k candidates → tier-2 sizing/constraints → place limit orders
(idempotent ids) → poll fills → journal → EOD: reconcile positions, cancel unfilled day orders,
post-trade review.

**24/7 crypto loop** (every N minutes, small symbol set):
health+account → snapshots for watchlist (no caching) → signals on bar tail → fee-hurdle check
→ size → market/limit gtc order → poll fill (seconds) → journal → drawdown/spend governor every
cycle; weekly agent review tunes parameters via proposals.

**Event-driven news loop:**
external news feed → FinBERT/agent triage → if material: snapshot + position check → proposal
to tier 2 → (often) *no trade*, journaled with rationale — the journal of trades *not* taken is
how you tune the trigger without burning capital.

---

## 7. What this service will and won't do for you

Will: idempotent order safety, typed retryable errors, strict validation, paper/live isolation,
audit logs, Prometheus metrics, a stable OpenAPI contract to codegen against.
Won't (by design — they're orchestrator concerns): schedule anything, stream ticks, compute
signals, hold strategy state, or stop you from trading badly at a strategy level. The
intelligence layer above owns the *why*; this API owns the *safely*.
