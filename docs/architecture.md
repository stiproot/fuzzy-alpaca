# fuzzy-alpaca-core — Architecture Blueprint

The as-built design of the service. Operational details (env vars, runbook, endpoint list) live
in [README.md](../README.md); the generated `openapi.json` is the authoritative wire contract.

## Purpose & consumer

An HTTP API wrapping the Alpaca trading platform for a **machine consumer**: an external workflow
orchestrator whose AI agents place/manage trades and gather market data. Everything follows from
that: strict schema validation in, predictable JSON out, a closed typed error enum with an
explicit `retryable` flag, and a generated OpenAPI artifact the orchestrator codegens against.

Covers US equities **and spot crypto** (added 2026-07-06 — see the symbol model below). Out of
scope (deliberately, with seams left): streaming/websockets, options/OTC, FX (Alpaca has no forex
asset class; would be a second provider adapter), multi-account, bracket/OCO order classes,
portfolio analytics, user management.

## Hexagonal layout

Ports are `Context.Tag` interfaces, adapters are `Layer` implementations, `src/index.ts` is the
composition root. The dependency rule is **lint-enforced** (`eslint.config.js`):

```
src/
├── domain/            # pure core: Schema types, branded primitives, tagged errors — imports nothing outward
├── ports/             # broker.ts: AlpacaClient Context.Tag — imports domain only
├── application/       # TradingService, MarketDataService (Effect.Service) — imports domain + ports (+ config)
└── adapters/
    ├── inbound/http/  # driving adapter: HttpApi groups/handlers/middleware, error envelope, prometheus
    └── outbound/alpaca/  # driven adapter: SDK + direct-REST client, errors-map, in-memory test broker
```

Only `src/adapters/outbound/alpaca/` may import `@alpacahq/alpaca-trade-api` (lint rule). The
SDK's loose types stop at the adapter: every response is re-decoded through our own schemas, so
the port surface is fully typed and a v4-SDK or full direct-REST swap never touches consumers.
The SDK's ancient axios is force-upgraded via npm `overrides` (`axios@^1.13`) to clear its CVEs.

## Services & layers

- **`AppConfig`** (`Effect.Service` over Effect `Config`) — reads env once, fail-fast at boot;
  derives `tradingMode: "paper" | "live"` which threads into every order response and `/health`.
- **`AlpacaClient`** (port, `src/ports/broker.ts`) — every method returns decoded domain types.
  Implementations: `AlpacaClientLive` (SDK + direct REST) and `AlpacaClientTest` (Ref-backed
  in-memory broker used by all tests).
- **`TradingService`** — account/clock, order flows (rails, idempotency, reconciliation, audit),
  positions, health connectivity probe (2s timeout → `ok|degraded`, never fails).
- **`MarketDataService`** — quote/trade/snapshot/bars, asset search, calendar.
- **HTTP layer** — schema-first `HttpApi` with generated OpenAPI (Swagger at `/docs`), auth as
  `HttpApiMiddleware` with an OpenAPI security annotation (`x-api-key`, constant-time compare),
  request-id middleware (span + log annotation + defect scrubbing).

## Broker call recipes (the core invariant)

Every Alpaca interaction goes through one of three pipelines in
`adapters/outbound/alpaca/live.ts`:

1. **Read/idempotent** — `source → schema decode → 10s timeout → Retry-After pause →
   jittered exponential retry (200ms×2ⁿ, ≤3 retries, retryable errors only) → metrics → span`.
2. **Mutation** (`createOrder`, `replaceOrder`, `closePosition`) — same but **no retry stage at
   all**: after a timeout/network failure the mutation may have reached Alpaca, and a blind retry
   could double-submit. Ambiguity is handled once, in the application layer (see below).
3. **Optional-404** — read recipe with 404 mapped to `Option.none` (position/asset/order lookups).

Contract drift (response fails our schema) is `AlpacaContractError` — 500 and **never retried**,
because drift doesn't heal on retry. `errors-map.ts` is the single thrown-error → domain-error
table (429 with Retry-After capture, 5xx, buying-power/PDT 403s, SIP-subscription 400, credential
401 → non-retryable `InternalError`); per-method refinements add `OrderNotFound`,
`OrderNotCancelable`, `PositionNotFound`.

## Order safety (non-negotiable stances)

- `clientOrderId` is **required** on placement — it is the idempotency key.
- The server **never resubmits**: on unknown submission outcome it reconciles via
  `getOrderByClientOrderId`; found → replay with `idempotentReplay: true`; not found → retryable
  503 instructing the agent to re-send the **same** `clientOrderId`. Alpaca's duplicate-id
  rejection triggers the same replay path.
- Size rails (`MAX_ORDER_NOTIONAL`/`MAX_ORDER_QTY`) and a 5-minute-cached tradability pre-check
  reject before Alpaca is contacted. Cancel-all is confirm-gated (409 without `?confirm=true`).
- Paper trading is the default; live requires both live keys and `ALPACA_LIVE=true`.
- Every mutation emits a structured `order.audit` log record (asserted in tests).

## Symbol model (equities + crypto)

Two disjoint branded symbol types union into `AnySymbol`: `TickerSymbol` (`AAPL`, `BRK.B`,
`BRK-B`) and `CryptoSymbol` (canonical slash pair, `BTC/USD`). URL paths can't carry `/`, so
paths accept the dash form (`BTC-USD`); `SymbolFromPath` maps dash→slash only when the suffix is
a known quote currency (`USDT|USDC|USD|BTC`, longest first), so dashed equities stay equities.
Response bodies always carry the canonical form.

Alpaca is inconsistent about crypto symbols on the wire; all translation lives in the adapter:
order bodies/data APIs use `BTC/USD`, trading-API *paths* use the legacy slashless form
(`/v2/positions/BTCUSD`, URL-encoded slash for non-USD quotes), and position wire symbols arrive
slashless and are normalized back to canonical via quote-currency suffix matching.

Crypto trading rules are enforced client-side in `CreateOrderRequest` (types
market/limit/stop_limit, TIF gtc/ioc, no `extendedHours`, no shorting/margin on Alpaca). Crypto
assets carry sizing constraints (`minOrderSize`, `minTradeIncrement`, `priceIncrement`); note
Alpaca's paper API rejects crypto orders under **$10 cost basis** (403 code 40310000 →
`ValidationError`). Fees are taken from the credited asset — a buy of qty X credits slightly
less than X to the position. The clock/calendar endpoints govern equities only; crypto trades
24/7.

## Domain model conventions

- Branded primitives (`TickerSymbol`, `CryptoSymbol`, `OrderId`, `ClientOrderId`, `MoneyString`,
  …); enums as `Schema.Literal` unions matching Alpaca's snake_case values.
- Trading-API money stays **validated decimal strings end-to-end** — never floats. Market-data
  prices are JSON numbers (Alpaca data-API format; informational, not transactional).
- Two schemas per resource: a **wire decode schema** (snake_case/short keys, renamed via
  `Schema.fromKey`) applied inside the adapter, and the camelCase **domain schema** used as the
  HTTP success contract. Nullable wire fields are `Schema.OptionFromNullOr` (encode back to
  `null`). Request schemas are strict (`onExcessProperty: "error"`).

## Error contract

Every non-2xx body (one exception below) is
`{ error: { code, message, retryable, requestId?, details? } }`. The closed set and mapping live
in `domain/errors.ts` + `adapters/inbound/http/envelope.ts` ("transport" schemas wrap domain
tagged errors so handlers fail with plain domain instances while OpenAPI documents the envelope):

| Code | HTTP | retryable |
|---|---|---|
| ValidationError | 400 | no |
| Unauthorized | 401 | no |
| OrderNotFound / PositionNotFound / AssetNotFound | 404 | no |
| OrderNotCancelable / ConfirmationRequired | 409 | no |
| InsufficientBuyingPower / PdtRuleViolation / AssetNotTradable / MaxOrderSizeExceeded | 422 | no |
| AlpacaRateLimited (details.retryAfterSeconds) | 429 | yes |
| AlpacaUnavailable / AlpacaTimeout | 503 | yes |
| AlpacaContractError / InternalError | 500 | no |

Exception: schema-invalid request bodies return the platform's `HttpApiDecodeError` 400 shape
with per-field issues. `DuplicateClientOrderId` exists internally between adapter and application
but never crosses HTTP.

## Pagination

- **Orders**: Alpaca has no page tokens on `/v2/orders`; the uniform `{ items, nextPageToken? }`
  contract is synthesized — the opaque token encodes the last item's `createdAt` + direction and
  folds into Alpaca's `after`/`until` bound. `side` filters post-fetch (no upstream param).
- **Bars**: direct REST carries Alpaca's **real** `next_page_token` through unchanged.
- **Assets**: upstream is unpaginated (full universe), so `search` prefix + `tradable` filter +
  `limit`, returning `{ items, totalMatches }`.

## Market data seam

All market-data reads (quote/trade/snapshot/bars) bypass the SDK and go direct-REST via
`@effect/platform` HttpClient — the SDK's bars iterator swallows the page token and its entity
remapping is undocumented. Same pipelines, same error map. Two upstreams, routed by symbol class
inside the adapter:

- **Stocks** — `data.alpaca.markets/v2/stocks/{symbol}/…`; 404s become `AssetNotFound`.
- **Crypto** — `data.alpaca.markets/v1beta3/crypto/us/…` with a `symbols=` query param;
  responses nest per symbol (`{ "quotes": { "BTC/USD": {…} } }`) and unknown symbols are
  *silently omitted* — the adapter maps a missing key to `AssetNotFound`. Bars carry a top-level
  `next_page_token` that is explicitly `null` when exhausted. No data subscription required.

## Testing strategy

- **`AlpacaClientTest`** (`adapters/outbound/alpaca/testing.ts`): in-memory broker over `Ref`
  state (order book with monotonic timestamps, positions, fixtures) with failure-injection knobs
  (`failCreate`, `failCreateAfterSubmitOnce` for reconciliation proofs, `onCreateStatus`).
  Fixtures are sanitized real Alpaca JSON decoded through the production wire schemas.
- Retry/timeout determinism via `TestClock` (429 storms, never-retry proofs, decode drift).
- HTTP contract tests run the full `HttpApi` over the test broker via `NodeHttpServer.layerTest`.
- The route surface (path+method set) is locked by an OpenAPI snapshot test.
- `scripts/smoke.ts` exercises the real paper account (never in CI; read-only on real positions).

## Observability

- Spans: `http.request` per request nesting `alpaca.<op>` per broker call; `x-request-id`
  accepted/minted, echoed, and annotated onto all logs in scope.
- Metrics (Prometheus at `/metrics`, unauthenticated): `alpaca_requests_total{op,outcome}`,
  `alpaca_request_duration_ms{op}` histogram, `orders_placed_total{trading_mode}` — recorded in
  the call recipe, counting logical calls (retries folded in).
- Rate budget: Alpaca ~200 req/min; ≤4 attempts per read, mutations never retry, Retry-After
  honored additively before backoff resumes.
