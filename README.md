# fuzzy-alpaca-core

HTTP trading API wrapping [Alpaca](https://alpaca.markets) for a machine consumer — an external
workflow orchestrator whose agents place trades and gather market intelligence. Built with
Effect-TS in a hexagonal layout. The as-built design lives in
[docs/architecture.md](docs/architecture.md); historical plan documents (per-task change logs)
live in [docs/plans/](docs/plans/).

## Quick start

```sh
cp .env.example .env      # fill in APCA keys + SERVICE_API_KEY
npm install
npm run dev               # serves on PORT (default 3000)
curl localhost:3000/health
open http://localhost:3000/docs   # Swagger UI
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `start` | Run the server (`.env` auto-loaded) |
| `npm test` | Offline test suite (in-memory broker, deterministic clock) |
| `npm run typecheck` / `lint` | Strict TS + SDK-quarantine/hexagonal lint rules |
| `npm run openapi` | Emit `openapi.json` — the contract the orchestrator codegens against |
| `npm run smoke` | Live paper-account smoke (clock → account → market data → order lifecycle → positions). **Not** run in CI; needs `.env` |

## API surface

All routes except `GET /health` and `GET /metrics` require the `x-api-key` header
(`SERVICE_API_KEY`). Every non-2xx response is the envelope
`{ error: { code, message, retryable, requestId?, details? } }` — agents branch on `code` and
`retryable`. Requests carry/echo `x-request-id`. Full schema: `npm run openapi` or `/docs`.

- **system** — `/health`, `/metrics` (Prometheus), `/v1/whoami`, `/v1/account`, `/v1/clock`
- **orders** — `POST /v1/orders` (strict body, qty XOR notional, `clientOrderId` **required** —
  it is the idempotency key), `GET /v1/orders` (filters + cursor pagination),
  `GET|PATCH|DELETE /v1/orders/:orderId`, `DELETE /v1/orders?confirm=true` (cancel-all)
- **positions** — `GET /v1/positions`, `GET|DELETE /v1/positions/:symbol` (partial close via
  `?qty=` or `?percentage=`; returns the liquidation order)
- **market data** — `GET /v1/market-data/:symbol/{quote,trade,snapshot,bars}` (bars carry
  Alpaca's real `nextPageToken`)
- **assets & calendar** — `GET /v1/assets`, `GET /v1/assets/:symbol`, `GET /v1/calendar`

**Crypto**: fully supported (spot pairs, 24/7). Canonical symbols are slash pairs (`BTC/USD`) in
request/response bodies; in URL *paths* use the dash form (`/v1/positions/BTC-USD`). Crypto
orders accept `gtc`/`ioc` only, types market/limit/stop_limit, no shorting, ≥$10 per order, and
maker/taker fees come out of the credited asset. The clock/calendar endpoints describe the
equities session only.

### Order-safety contract (read before integrating)

- The server **never** retries or resubmits order mutations. If placement outcome is unknown
  (timeout/network), the server reconciles by `clientOrderId`; if the order isn't found you get a
  retryable 503 telling you to **re-send the same `clientOrderId`**. Duplicate submissions replay
  the existing order with `idempotentReplay: true`.
- Size rails (`MAX_ORDER_NOTIONAL`, `MAX_ORDER_QTY`) and a cached tradability pre-check reject
  bad orders before Alpaca sees them.
- Every order mutation emits a structured `order.audit` log record.

## Runbook

### Environment

| Var | Notes |
|---|---|
| `APCA_API_KEY_ID` / `APCA_API_SECRET_KEY` | Alpaca keys. Paper and live are **separate key pairs** |
| `ALPACA_LIVE` | `false` (default) = paper. See checklist before flipping |
| `SERVICE_API_KEY` | Key the orchestrator sends as `x-api-key` |
| `FEED` | `iex` (default, free) or `sip` (requires paid data subscription; without it Alpaca rejects with a clear 422) |
| `MAX_ORDER_NOTIONAL` / `MAX_ORDER_QTY` | Optional hard caps; unset = uncapped |
| `PORT` | default 3000 |

### Key rotation

1. Generate new keys in the Alpaca dashboard (paper: paper dashboard; live: live dashboard).
2. Update `.env` / secret store; restart the service (config is read once at boot, fail-fast).
3. Verify: `curl -s localhost:3000/health` → `alpacaConnectivity: "ok"`.
4. Revoke the old pair in the dashboard.
5. Rotate `SERVICE_API_KEY` the same way — update the orchestrator's copy first, then the
   service's, restart, then retire the old value.

### Paper → live checklist

1. Live Alpaca account funded and approved; **live** key pair generated.
2. Set `MAX_ORDER_NOTIONAL` / `MAX_ORDER_QTY` to intentional values — do not go live uncapped.
3. Swap `APCA_API_*` to the live pair AND set `ALPACA_LIVE=true` (mismatched pair + flag fails
   auth at the first call, visible in `/health`).
4. Restart; confirm `/health` and `/v1/whoami` report `tradingMode: "live"` — the orchestrator
   should assert this before its first order; every order response also echoes `tradingMode`.
5. Run one tiny sanity order manually (e.g. 1 share limit far from market, then cancel).
6. Watch `orders_placed_total{trading_mode="live"}` and `order.audit` logs from the first minute.

### Rate budget

Alpaca allows ~200 requests/min per account. Every broker call retries at most 3 times
(exponential 200ms×2^n, jittered) and only on retryable errors (429/5xx/timeout); 429s honor
`Retry-After` before backing off. Order mutations never retry, so worst-case amplification is 4×
on reads only. The orchestrator should still pace itself; on a 429 envelope
(`retryable: true`, `details.retryAfterSeconds`) back off client-side.

### Observability

- `GET /metrics` (Prometheus): `alpaca_requests_total{op,outcome}`,
  `alpaca_request_duration_ms{op}`, `orders_placed_total{trading_mode}`.
- Traces: one span per HTTP request (`http.request`) with nested `alpaca.<op>` spans per broker
  call; wire an OTLP exporter when the collector lands.
- Logs: structured, annotated with `requestId`; order mutations emit `order.audit` records —
  ship these somewhere durable in live mode.
