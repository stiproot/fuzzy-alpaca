# fuzzy-alpaca-core — Implementation Plan

## Overview

`fuzzy-alpaca-core` is an HTTP API service that wraps the Alpaca trading platform for consumption by an external workflow orchestrator whose AI agents (a) place and manage trades and (b) gather stock-market information. The consumer is a machine, not a human: every response is predictable JSON, every request is strictly schema-validated, every failure is a member of a closed, typed error enum with an explicit `retryable` flag, and the whole contract is published as a generated OpenAPI artifact the orchestrator can codegen against.

Design stance: **MVP-first with hard seams.** Ship the smallest service the orchestrator can drive end-to-end (auth → account/clock → place/inspect/cancel orders → positions → market data), and put every deferrable feature behind a clean seam: one Alpaca wrapper tag, one error taxonomy, one schema module per resource. The orchestrator can trade after milestone 3 of 6.

Non-goals (MVP): streaming/websockets, options/crypto/OTC, multi-account, bracket/OCO order classes, portfolio analytics, user management, dry-run simulation.

## Progress

| Milestone | Status | Notes |
|---|---|---|
| 1. Scaffold + health + contract skeleton | ✅ done (2026-07-05) | See deltas below |
| 2. AlpacaClient + account/clock | ⬜ not started | |
| 3. Order write path | ⬜ not started | |
| 4. Order read + replace | ⬜ not started | |
| 5. Positions | ⬜ not started | |
| 6. Market intelligence + ops hardening | ⬜ not started | |

**Milestone 1 deltas from plan:**
- Added `GET /v1/whoami` (authenticated, returns `{ authenticated, tradingMode }`) so auth and the 401 envelope are exercisable before milestone 2's endpoints exist — also a cheap connectivity check for the orchestrator. MVP is 20 routes, not 19.
- `/health` reports `alpacaConnectivity: "unknown"` until milestone 2 wires the real clock probe.
- Envelope `requestId` field: correlation currently rides the `x-request-id` response header (set via `HttpApp.appendPreResponseHandler` — the API builder commits responses before plain middleware regains control); populating the JSON body field lands with the error-mapping work in milestone 2.
- ESLint (SDK-import quarantine + hexagonal dependency rule) lands in milestone 2 alongside the first SDK import, per that milestone's DoD.
- Effect versions pinned by install: `effect@3.21.x`, `@effect/platform@0.96.x`, `@effect/platform-node@0.107.x`, vitest 3 (peer range of `@effect/vitest`).

## Tech stack & bootstrap

**Packages (pinned):**
- Runtime: `effect`, `@effect/platform`, `@effect/platform-node`, `@alpacahq/alpaca-trade-api@3.1.3` (exact pin — the only active official JS SDK; the v4 TypeScript rewrite is a days-old alpha, tracked but not shipped; `@alpacahq/typescript-sdk` is archived and dead)
- Dev: `typescript`, `tsx`, `vitest`, `@effect/vitest`

The v3 SDK's loose types (`any`-heavy) and old axios 0.21.x dependency are contained by construction: **exactly one file imports `@alpacahq/alpaca-trade-api`**, enforced by a lint rule (`no-restricted-imports` scoped to everything outside `src/adapters/outbound/alpaca/`). Every response is re-decoded through our own `Schema` before it leaves the wrapper, which also insulates a later swap to v4 stable or direct `@effect/platform` HttpClient.

**`tsconfig.json`:** `"strict": true`, `"exactOptionalPropertyTypes": true`, `"noUncheckedIndexedAccess": true`, `"target": "ES2022"`, `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`.

**Scripts:** `"dev": "tsx watch src/index.ts"`, `"start": "tsx src/index.ts"`, `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`, `"openapi": "tsx scripts/emit-openapi.ts"` (serializes the `HttpApi` definition to `openapi.json`; run in CI and published as an artifact so the orchestrator repo can codegen its client).

**Layout — hexagonal (ports & adapters).** The mapping onto Effect is direct: a *port* is a `Context.Tag` interface, an *adapter* is a `Layer` that implements it, and the composition root wires them. The domain core and application services never import an adapter — only ports and domain types.

```
/home/stiproot/code/fuzzy-alpaca/
├── src/
│   ├── index.ts                     # composition root: NodeRuntime.runMain(Layer.launch(...))
│   ├── config.ts                    # AppConfig service (Effect Config)
│   ├── domain/                      # pure core — no Effect services, no I/O, no adapter imports
│   │   ├── errors.ts                # all Schema.TaggedError classes + envelope schema
│   │   ├── primitives.ts            # branded Schemas (TickerSymbol, MoneyString, ...)
│   │   └── schemas/                 # order.ts, position.ts, account.ts, marketData.ts,
│   │                                #   asset.ts, clock.ts, pagination.ts
│   ├── ports/
│   │   └── broker.ts                # AlpacaClient Context.Tag — the outbound (driven) port
│   ├── application/                 # use cases, depend only on ports + domain
│   │   ├── trading/                 # TradingService (Effect.Service), __tests__/
│   │   └── market-data/             # MarketDataService (Effect.Service), __tests__/
│   └── adapters/
│       ├── inbound/http/            # driving adapter
│       │   ├── api.ts               # HttpApi.make("fuzzy-alpaca-core") + groups
│       │   ├── groups/              # system.ts, orders.ts, positions.ts, marketData.ts, assets.ts
│       │   ├── handlers/            # HttpApiBuilder.group per group
│       │   └── middleware/          # auth.ts (HttpApiMiddleware), requestId.ts
│       └── outbound/alpaca/         # driven adapter implementing the broker port
│           ├── live.ts              # AlpacaClientLive (Layer.effect over the SDK)
│           ├── errors-map.ts        # axios error → tagged domain error
│           ├── testing.ts           # AlpacaClientTest in-memory broker Layer
│           └── __tests__/
├── scripts/                         # emit-openapi.ts, smoke.ts (paper-account, not in CI)
├── package.json / tsconfig.json / vitest.config.ts / .eslintrc / .env.example
```

Dependency rule (lint-enforced alongside the SDK-import rule): `domain/` imports nothing from `ports/`, `application/`, or `adapters/`; `ports/` imports only `domain/`; `application/` imports `domain/` + `ports/`; only `adapters/` and `index.ts` may import the outside world.

## Architecture — services & layers

Four services plus the HTTP layer, composed once at the entrypoint.

### `AppConfig` (`Effect.Service`, built from Effect `Config`)

Reads `APCA_API_KEY_ID` / `APCA_API_SECRET_KEY` (`Config.redacted`), `ALPACA_LIVE` (default `false` → `paper: true`), `SERVICE_API_KEY` (redacted, for `x-api-key`), `PORT`, `MAX_ORDER_NOTIONAL?` / `MAX_ORDER_QTY?` (as `Option<number>`), `FEED` (fixed `"iex"` default). Fails fast at boot on missing config. `tradingMode: "paper" | "live"` is derived here once and threaded into every order response and `/health`.

### `AlpacaClient` (`Context.Tag`) — the outbound broker port (`src/ports/broker.ts`)

Interface and implementation are deliberately separate — a v4 or direct-HTTP layer can replace the Live layer without touching consumers, and tests provide their own. The interface is **fully typed**: every method returns a decoded domain type, so a forgotten decode is a compile error and loose SDK types never escape.

```ts
export class AlpacaClient extends Context.Tag("AlpacaClient")<AlpacaClient, {
  readonly getAccount: () => Effect.Effect<Account, AlpacaError>
  readonly getClock: () => Effect.Effect<Clock, AlpacaError>
  readonly createOrder: (p: CreateOrderParams) => Effect.Effect<Order, AlpacaError>
  readonly getOrderByClientOrderId: (id: ClientOrderId) => Effect.Effect<Option.Option<Order>, AlpacaError>
  // getOrders, getOrder, replaceOrder, cancelOrder, cancelAllOrders,
  // getPositions, getPosition (→ Option), closePosition, getLatestQuote,
  // getLatestTrade, getSnapshot, getBars, getAsset (→ Option), getAssets, getCalendar
}>() {}
```

`AlpacaClientLive` (`Layer.effect`, depends on `AppConfig`) constructs `new Alpaca({ keyId, secretKey, paper: !live, feed })` once. Every method goes through one shared recipe:

```ts
const call = <A, I>(name: string, thunk: () => Promise<unknown>, schema: Schema.Schema<A, I>) =>
  Effect.tryPromise({ try: thunk, catch: mapAxiosError }).pipe(         // axios err → tagged, never raw
    Effect.flatMap((raw) => Schema.decodeUnknown(schema)(raw).pipe(
      Effect.mapError((p) => new AlpacaContractError({ op: name, parseError: TreeFormatter.formatErrorSync(p) })
    ))),                                                                 // response contract enforced here
    Effect.timeoutFail({ duration: "10 seconds", onTimeout: () => new AlpacaTimeout({ op: name }) }),
    Effect.retry(alpacaRetryPolicy),                                     // retryable errors only, see §Resilience
    Effect.withSpan(`alpaca.${name}`),
  )
```

`errors-map.ts` translates axios errors by `err.response?.status` / `err.response?.data?.{code,message}` per the verified Alpaca error shapes: 429 → `AlpacaRateLimited` (capturing `Retry-After` into `retryAfterSeconds`); 403 buying-power text → `InsufficientBuyingPower`; 404 code `40410000` → position-not-found (surfaced as `Option.none` from `getPosition`); 422 → `ValidationError` or a specific business error by Alpaca code; 40010001 SIP-feed → `ValidationError` with a clear "subscription does not permit SIP data" detail; network errors / 5xx → `AlpacaUnavailable`. Decode failures are `AlpacaContractError` — **500 and non-retryable**, because contract drift never heals on retry.

**Bars exception:** the SDK's `getBarsV2` is an auto-paginating AsyncGenerator that hides `next_page_token`, so it cannot express our page contract. `getBars` therefore bypasses the SDK and calls `GET https://data.alpaca.markets/v2/stocks/{symbol}/bars` directly via `@effect/platform` `HttpClient` (same key headers, same `call` recipe), passing `limit`/`page_token` through and returning the real `next_page_token`. This is the documented clean seam for going direct-HTTP, exercised early on one endpoint.

### `TradingService` (`Effect.Service`, depends on `AlpacaClient` + `AppConfig`)

Account, clock, orders, positions. Owns:
- **Idempotency replay**: duplicate `clientOrderId` rejection from Alpaca → look up existing order → return with `idempotentReplay: true`.
- **Ambiguity reconciliation** (see §Resilience): never blind-retries `createOrder`.
- **Safety rails inline** (no separate guardrail service): size caps (`MaxOrderSizeExceeded`), cancel-all confirm gate (`ConfirmationRequired`), and a pre-flight tradability check — `getAsset(symbol)` with a small in-memory TTL cache (5 min) → `AssetNotTradable` before any order hits Alpaca, `AssetNotFound` if unknown.
- **Option shaping**: `getPosition` is `Effect<Option<Position>>`; only the handler converts `Option.none` to the 404 error.
- **Audit logging** of every mutation.

### `MarketDataService` (`Effect.Service`, depends on `AlpacaClient`)

Quote/trade/snapshot/bars/assets/calendar; normalizes pagination to the uniform `{ items, nextPageToken? }` shape.

### HTTP layer

Schema-first `HttpApi` — the documented fit for machine agents, and the OpenAPI generator. Groups: `system` (health + account + clock), `orders`, `positions`, `marketData`, `assets` (assets + calendar).

- **Auth is `HttpApiMiddleware`**, declared in the API definition itself with a security annotation, so the `x-api-key` scheme appears in generated OpenAPI and the `/health` exemption is expressed structurally (the middleware is attached to every group; the `health` endpoint alone is excluded). Comparison via `crypto.timingSafeEqual`; failure is the `Unauthorized` error.
- **`withRequestId`** server middleware: accept or generate `x-request-id`, set the response header, stash in a `Context.Tag`, `Effect.annotateLogs({ requestId })`, `Effect.withSpan("http.<route>")`.
- **Errors on the contract**: every endpoint declares its failure modes via `HttpApiEndpoint.addError(ErrorClass, { status })` — which is why errors are `Schema.TaggedError` classes (see below): they are schemas, so statuses and the envelope land in the generated OpenAPI, and the declarations type-check.

**Composition** (`src/index.ts`):

```ts
const AppLayer = HttpApiBuilder.api(api).pipe(
  Layer.provide(Handlers),                          // all group handlers
  Layer.provide(TradingService.Default),
  Layer.provide(MarketDataService.Default),
  Layer.provide(AlpacaClientLive),
  Layer.provide(AppConfig.Default),
)
NodeRuntime.runMain(Layer.launch(HttpApiBuilder.serve(withRequestId).pipe(
  Layer.provide(HttpApiSwagger.layer({ path: "/docs" })),
  Layer.provide(AppLayer),
  Layer.provide(NodeHttpServer.layer(createServer, { port })),
)))
```

## Domain model & error contract

### Branded primitives (`domain/primitives.ts`)

- `TickerSymbol` — `Schema.String.pipe(Schema.pattern(/^[A-Z][A-Z.\-]{0,9}$/), Schema.brand("TickerSymbol"))` (covers class shares like `BRK.B` and hyphenated symbols)
- `MoneyString` — decimal-string pattern `/^-?\d+(\.\d+)?$/`, brand `"Money"`. Alpaca returns qty/price as JSON strings; we keep them as **validated decimal strings end-to-end, never floats** — no drift on real money.
- `OrderId` (UUID brand), `ClientOrderId` (1–48 chars brand), `PageToken` (opaque brand), `IsoTimestamp` (`Schema.DateFromString`, encoded back to ISO-8601 UTC).
- Enums as `Schema.Literal` unions, lowercase snake_case matching Alpaca: `OrderSide`, `OrderType = "market"|"limit"|"stop"|"stop_limit"`, `TimeInForce = "day"|"gtc"|"ioc"|"fok"`, `OrderStatus`.

### Resource schemas (`domain/schemas/*.ts`)

`Order` (camelCase: `orderId`, `clientOrderId`, `status`, `replacesOrderId: Schema.OptionFromNullOr(OrderId)`, `tradingMode`), `Position`, `Account`, `Clock`, `Quote`, `Trade`, `Bar` (`{t,o,h,l,c,v}`), `Snapshot`, `Asset`, `CalendarDay`, and generic `Paginated(item)` = `{ items, nextPageToken? }`.

Each resource has two schemas: a **decode schema** (Alpaca's snake_case, stringly-numbered wire shape) with `Schema.transform` into the camelCase domain shape — applied *inside* `AlpacaClient` — and the domain schema used as the HTTP success contract. Request schemas are **strict** structs (unknown keys rejected, so agent typos fail loudly). `CreateOrderRequest` is a `Schema.Union` of qty-XOR-notional variants with a `Schema.filter` cross-check that `limitPrice`/`stopPrice` presence matches `type`, and requires `clientOrderId`.

### Tagged errors (`domain/errors.ts`)

One class per envelope code, defined as `Schema.TaggedError` so each is simultaneously a typed error, a schema, and an OpenAPI-visible contract element:

```ts
export class InsufficientBuyingPower extends Schema.TaggedError<InsufficientBuyingPower>()(
  "InsufficientBuyingPower",
  { message: Schema.String, alpacaCode: Schema.optional(Schema.Number) }
) {}
```

Closed enum, statuses, and retryability:

| Error code | HTTP | `retryable` |
|---|---|---|
| `ValidationError` | 400 | false |
| `Unauthorized` | 401 | false |
| `OrderNotFound` / `PositionNotFound` / `AssetNotFound` | 404 | false |
| `OrderNotCancelable`, `ConfirmationRequired` | 409 | false |
| `InsufficientBuyingPower`, `PdtRuleViolation`, `MarketClosed`, `AssetNotTradable`, `MaxOrderSizeExceeded` | 422 | false |
| `AlpacaRateLimited` (carries `retryAfterSeconds`) | 429 | true |
| `AlpacaUnavailable`, `AlpacaTimeout` | 503 | true |
| `AlpacaContractError` (response decode drift) | 500 | false |
| `InternalError` (scrubbed defects) | 500 | false |

Envelope for every non-2xx: `{ error: { code, message, details?, retryable, requestId } }`, produced by one `errorToResponse` at the API edge (`Effect.catchTags` over the closed set; unhandled tags fall to a defect handler → `InternalError` with scrubbed message). Raw SDK exceptions cannot reach the edge by construction — `AlpacaClient`'s error channel is already the closed set. `ConfirmationRequired` is deliberately 409 (not 400) so agents branching on status never confuse it with `ValidationError`.

## Endpoints (MVP — 20 routes, all under generated OpenAPI at `/docs`)

| Group | Method & path | Notes |
|---|---|---|
| system | `GET /health` | **No auth.** Probes `getClock` with 2s timeout → `alpacaConnectivity: ok\|degraded`; echoes `tradingMode`, `timestamp`. |
| system | `GET /v1/whoami` | Auth smoke test for agents: `{ authenticated: true, tradingMode }`. |
| system | `GET /v1/account` | Buying power, PDT flags, equity — agents call before sizing. |
| system | `GET /v1/clock` | `isOpen`, `nextOpen`, `nextClose`. |
| orders | `POST /v1/orders` | Strict body; qty XOR notional; `clientOrderId` required. 201 on create; 200 + `idempotentReplay: true` on replay. |
| orders | `GET /v1/orders` | Filters: `status, symbols, side, after, until, limit, pageToken, direction`. → `{ items, nextPageToken? }`. |
| orders | `GET /v1/orders/:orderId` | `?byClientOrderId=true` supported; 404 `OrderNotFound`. |
| orders | `PATCH /v1/orders/:orderId` | Replace; returns the **new** order with `replacesOrderId`. |
| orders | `DELETE /v1/orders/:orderId` | Cancel; cancel-of-canceled returns current state, not an error; filled → 409 `OrderNotCancelable`. |
| orders | `DELETE /v1/orders?confirm=true` | Cancel-all panic button; without `confirm=true` → 409 `ConfirmationRequired`. |
| positions | `GET /v1/positions` | P&L surface: qty, avgEntryPrice, marketValue, unrealizedPl, … |
| positions | `GET /v1/positions/:symbol` | `Option`-based inside; 404 `PositionNotFound` at the edge. |
| positions | `DELETE /v1/positions/:symbol` | Full close, or partial via `?qty=` / `?percentage=`; returns the liquidation order. |
| marketData | `GET /v1/market-data/:symbol/quote` | Latest NBBO. |
| marketData | `GET /v1/market-data/:symbol/trade` | Latest trade. |
| marketData | `GET /v1/market-data/:symbol/snapshot` | Quote + trade + minute/daily/prev-daily bars in one call. |
| marketData | `GET /v1/market-data/:symbol/bars` | `timeframe, start, end, limit, pageToken, adjustment`; direct-REST under the hood → real `nextPageToken`. |
| assets | `GET /v1/assets` | `status=active, tradable=true, search?`; paginated. |
| assets | `GET /v1/assets/:symbol` | Tradability check: `tradable, fractionable, shortable, …`. |
| assets | `GET /v1/calendar` | `start, end` → `[{ date, open, close }]`. |

Pagination is uniform everywhere: `limit` (default 100, max 1000) + opaque `pageToken`; response `{ items, nextPageToken? }`. Never offset-based. Versioning: `/v1` lives in group path prefixes; breaking changes mean a new group set, never mutation of v1 schemas.

**Deferred (seams ready):** bracket/OCO (`orderClass` variant added to the `CreateOrderRequest` union), account activities & portfolio history (new `AlpacaClient` methods), news + multi-symbol batch endpoints, watchlists, streaming.

## Resilience & safety

- **Retry policy** (`alpacaRetryPolicy`, one shared constant): `Schedule.exponential("200 millis", 2).pipe(Schedule.intersect(Schedule.recurs(3)), Schedule.jittered)` with `while: (e) => e.retryable` — only `AlpacaRateLimited` / `AlpacaUnavailable` / `AlpacaTimeout` retry; business 4xx and `AlpacaContractError` never do. On 429, sleep `max(backoff, retryAfterSeconds)` before the schedule resumes — a tested behavior under simulated 429 storms. The SDK does not auto-retry 429s; we own this entirely. The 3-attempt cap plus client-side `retryable` signaling keeps us inside Alpaca's ~200 req/min budget.
- **Ambiguous order writes — the non-negotiable stance:** `createOrder` is **never blind-retried** and the server **never auto-resubmits**. On timeout/network failure after submission, `TradingService.placeOrder` reconciles via `getOrderByClientOrderId`: `Option.some` → return the order with `idempotentReplay: true`; `Option.none` → surface `AlpacaUnavailable` (retryable) so **the agent** re-sends the same `clientOrderId`. This eliminates the double-market-order window entirely; retry ownership for the one ambiguous case moves to the caller, which holds the idempotency key.
- **Idempotency:** `clientOrderId` required (400 `ValidationError` if absent — duplicate market orders are the worst failure mode). Alpaca duplicate-id rejection → look up existing → 200 + `idempotentReplay: true`. Replace/cancel are naturally idempotent by `orderId`.
- **Safety rails:** paper by default (`ALPACA_LIVE=true` opt-in; Alpaca enforces separate key pairs); `tradingMode` echoed in every order response and `/health`; `MAX_ORDER_NOTIONAL`/`MAX_ORDER_QTY` checked in `TradingService` before any SDK call; pre-flight tradability check (cached `getAsset`) → `AssetNotTradable` before Alpaca sees the order; cancel-all confirm-gated.
- **Timeouts:** 10s per Alpaca call (`Effect.timeoutFail` → `AlpacaTimeout`); health probe 2s.
- **Auth:** `x-api-key` via `HttpApiMiddleware` with constant-time compare; Alpaca credentials live server-side only, never accepted from or exposed to callers.

## Testing & observability

**Testing** (vitest + `@effect/vitest`):
- **`AlpacaClientTest`** (`adapters/outbound/alpaca/testing.ts`): a `Layer` over a `Ref`-backed in-memory broker (order book + positions) with knobs to inject any tagged error or delay per method. Built incrementally — it grows the minimal state each milestone's tests need (orders state at milestone 3, positions at 5). Because domain services depend only on the tag, every service and HTTP test is offline and deterministic, including multi-step lifecycles (place → replace → cancel, replay, confirm-gating).
- **Fixtures are captured real Alpaca JSON** (snake_case, string numbers), so decode schemas are exercised exactly as production sees them; schema round-trip tests assert decode ∘ encode = id and strict rejection of unknown keys.
- **Error-mapping table test**: fixture axios errors (40010001 / 40110000 / 42210000 / 40410000 / 429 + `Retry-After` / network) → expected tags.
- **Retry/timeout determinism** with `TestClock.adjust`: 429-then-success honors `max(backoff, Retry-After)`; 422 provably never retries; decode drift → `AlpacaContractError`, no retry.
- **HTTP contract tests**: full `HttpApi` over `AlpacaClientTest`, asserting status codes, envelope shape, strict-schema 400s, auth 401, idempotent replay, confirm gate, and an `openapi.json` snapshot (contract stability is a test).
- **Paper-account smoke** (`scripts/smoke.ts`), excluded from CI: clock → asset check → snapshot → order → position → close.

**Observability:**
- Traces: `Effect.withSpan("http.<route>")` per route (middleware) nested over `alpaca.<method>` spans → full parent/child trace tree per request.
- Logs: `Effect.annotateLogs({ requestId, symbol, orderId })` throughout; `x-request-id` echoed in every response and envelope.
- **Audit log** on every mutation (place/replace/cancel/close/cancel-all): one structured record `{ requestId, apiKeyId, action, request, outcome: orderId|errorCode, tradingMode, timestamp }` via `Effect.logInfo("order.audit")` — non-negotiable for real money.
- Metrics: `Metric.counter("alpaca_requests_total")` tagged by method/outcome and `Metric.timer("alpaca_request_duration")` from day one; `orders_placed_total` tagged by `tradingMode` and a Prometheus scrape endpoint at `/metrics` land in milestone 6.
- OpenAPI: Swagger UI at `/docs`; `openapi.json` emitted by script and published from CI — the orchestrator's agents consume this as their tool contract.

## Milestones (PR-sized)

1. **Scaffold + health + contract skeleton.** Bootstrap, tsconfig (strict / exactOptionalPropertyTypes / noUncheckedIndexedAccess), `AppConfig`, `HttpApi` skeleton with `Schema.TaggedError` classes + envelope + `errorToResponse`, `HttpApiMiddleware` auth + request-id middleware, `GET /health` (stubbed connectivity), `scripts/emit-openapi.ts` wired into CI.
   *DoD:* `npm run dev` serves `/health` and `/docs`; wrong `x-api-key` → 401 envelope; `/health` unauthenticated; CI emits `openapi.json` artifact; typecheck + tests green.
2. **AlpacaClient + account/clock.** SDK wrapper with the shared `call` recipe (tryPromise → decode → timeout → retry → span), full `errors-map.ts`, `AlpacaContractError` path, lint rule confining the SDK import, `GET /v1/account`, `GET /v1/clock`, real health connectivity.
   *DoD:* against a paper account both endpoints return decoded domain JSON; error-map table test and decode-drift test pass; lint fails on SDK import outside `alpaca-client/`; spans emitted per SDK call.
3. **Order write path.** `POST /v1/orders` (strict schema, qty-XOR-notional, required `clientOrderId`, size rails, cached tradability pre-check, ambiguity reconciliation with agent-driven retry), `DELETE /v1/orders/:orderId`, cancel-all with confirm gate, audit logs; `AlpacaClientTest` in-memory order book introduced here.
   *DoD:* paper smoke places + cancels a market order; replayed `clientOrderId` → 200 `idempotentReplay: true`; oversized or non-tradable order → 422 without hitting Alpaca; reconciliation test proves no server-side resubmit; cancel-all without confirm → 409. **Orchestrator can trade after this PR.**
4. **Order read + replace.** `GET /v1/orders` (filters + pagination), `GET /v1/orders/:orderId` (+`byClientOrderId`), `PATCH` replace returning `replacesOrderId`.
   *DoD:* contract tests for pagination shape and 404 envelope; replace returns new id linking old; lifecycle test (place → replace → cancel) green against the in-memory broker.
5. **Positions.** List/get/close (partial via qty/percentage), `Option`-based not-found, close returns the liquidation order.
   *DoD:* unknown symbol → 404 `PositionNotFound` with `retryable: false`; partial close verified on paper account; audit records asserted for close.
6. **Market intelligence + ops hardening.** Quote/trade/snapshot/bars (direct-REST bars with real `nextPageToken`), assets, calendar, SIP-permission error mapped to a clear 422 detail; `/metrics` Prometheus endpoint with full metric set; 429-storm test proving `Retry-After` honoring; load sanity vs the 200 req/min budget; README runbook (key rotation, paper→live checklist).
   *DoD:* all 19 MVP endpoints present in the published `openapi.json` (snapshot test); bars `pageToken` round-trips; full paper smoke (clock → asset → snapshot → order → position → close) recorded; metrics scrapeable; runbook committed.