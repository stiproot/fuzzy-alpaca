# Crypto trading support

> **Historical plan document — task completed 2026-07-06.** Durable context extracted to
> [docs/architecture.md](../architecture.md) (symbol model, crypto data seam),
> [README.md](../../README.md) (crypto usage notes), and
> [docs/concepts/trading-basics.md](../concepts/trading-basics.md) (crypto differences).
> Do not treat this file as current documentation.

Add Alpaca spot-crypto trading and market data to fuzzy-alpaca-core. FX was considered and
dropped (Alpaca has no forex asset class; a future FX integration would be a separate provider
behind a new adapter). Facts below were verified against Alpaca docs/OpenAPI specs and live
(unauthenticated) calls to the crypto data API on 2026-07-06.

## Progress

| Milestone | Status | Notes |
|---|---|---|
| 1. Symbol model + class-aware domain | ✅ done (2026-07-06) | Equity suite green unchanged; 11 new tests |
| 2. Adapter: normalizations + crypto data seam + test broker | ✅ done (2026-07-06) | 69 tests green; per-symbol envelope unwrap unit-tested |
| 3. Service/HTTP + live crypto lifecycle verify | ✅ done (2026-07-06) | Live: buy 0.0002 BTC → filled @63012 → position BTC/USD (fee-reduced qty 0.0001995) → full close → gone. Also live-verified the M5-deferred close path |
| 4. Docs extraction + wrap-up | ✅ done (2026-07-06) | |

## Deltas from plan

- **Paper crypto orders need ≥$10 cost basis** (403 code 40310000, "cost basis must be >= minimal
  amount of order 10") — stricter than the documented ~$1 `min_order_size`. The smoke buys
  0.0002 BTC (~$13). The error map now routes 403+40310000 business rejections to
  `ValidationError` instead of `InternalError`.
- **Alpaca dropped the PDT-era account fields** (`daytrading_buying_power`,
  `pattern_day_trader`, `daytrade_count`) — the contract guard caught it live (post-June-2026
  intraday margin framework). They are now optional Options in the account schema.
- Fees confirmed live: buying 0.0002 BTC credited 0.0001995 to the position.

## Verified Alpaca crypto facts (drive the design)

- **Orders** (`POST /v2/orders`): body accepts canonical `BTC/USD` (legacy `BTCUSD` translated);
  responses echo the slash form with `asset_class: "crypto"`. Types: `market|limit|stop_limit`
  only. TIF: `gtc|ioc` only. qty/notional both supported (up to 9 decimals, fractional always);
  **no shorting, no margin** (evaluated against `non_marginable_buying_power`); ≤$200k notional
  per order.
- **Assets**: slash-form symbols, `class: "crypto"`, `exchange: "ALPACA"`; crypto-only decimal-string
  fields `min_order_size`, `min_trade_increment`, `price_increment`. Path lookups need old
  symbology (`/v2/assets/BTCUSD`) or URL-encoded slash for non-USD quotes.
- **Positions**: **slashless symbols** (`BTCUSD`), `asset_class: "crypto"`, always `long`.
  Close via slashless path (strongly implied; also asset_id works — flag as runtime-verify).
- **Market data**: separate API `https://data.alpaca.markets/v1beta3/crypto/us/…` — endpoints
  `latest/quotes`, `latest/trades`, `snapshots`, `bars` all take `symbols=BTC/USD` (comma list;
  slashless is rejected), responses nest per symbol: `{ "quotes": { "BTC/USD": {…} } }`.
  Quote fields `t/bp/bs/ap/as`, trade `t/p/s/(tks,i)`, bars `t/o/h/l/c/v/n/vw` (array) with
  top-level `next_page_token` (**explicitly null when exhausted**). Snapshot keys camelCase like
  stocks. **Unknown symbols are silently omitted** from the response map (not a 404). No data
  subscription needed; still send auth headers. `limit` ≤10000.
- **Rules**: 24/7 (clock/calendar do not gate crypto), no PDT, tiered maker/taker fees
  (0.15%/0.25% at tier 1) charged on the received asset — a buy of qty X credits slightly
  less than X.
- **Runtime-unverified flags**: exact 422 for `day` TIF / `extended_hours` on crypto (spec says
  unsupported — we reject client-side); `exchange` value on crypto positions (don't
  enum-validate); slashless DELETE position (verify in smoke).

## Design

### Symbol model

- New `CryptoSymbol` brand: canonical slash form, `^[A-Z0-9]{2,10}\/[A-Z]{2,6}$`.
- `AnySymbol = Schema.Union(TickerSymbol, CryptoSymbol)` replaces `TickerSymbol` in order,
  position, asset, and market-data schemas and the broker port.
- **Path-safe form**: URL paths can't carry `/`, so paths accept the dash form `BTC-USD`.
  A `SymbolFromPath` codec maps dash→slash **only when the suffix after the last dash is a known
  crypto quote currency** (`USDT`, `USDC`, `USD`, `BTC` — longest first), so equity tickers like
  `BRK-B` still resolve as equities. Response bodies always carry the canonical form.
- Adapter-side wire translations (invisible outside the adapter):
  - order/data APIs: canonical `BTC/USD` out;
  - asset path lookups: slashless for `*/USD`, URL-encoded otherwise;
  - position wire symbols: slashless → canonical via the same quote-currency suffix match, keyed
    off `asset_class == "crypto"`;
  - position close path: slashless.

### Domain & validation

- `Asset` gains optional `minOrderSize`, `minTradeIncrement`, `priceIncrement` (decimal strings)
  and `assetClass` stays a plain string.
- `CreateOrderRequest` filter becomes class-aware (crypto ⇒ type ∈ {market, limit, stop_limit},
  tif ∈ {gtc, ioc}, `extendedHours` rejected) so unsupported combinations fail our 400 with a
  clear message instead of a round-trip to Alpaca. Equity rules unchanged.
- `ReplaceOrderRequest` unchanged (Alpaca supports replace for open crypto limit orders).

### Adapter

- Existing stocks data seam untouched; a parallel crypto path builds
  `v1beta3/crypto/us/<kind>?symbols=<canonical>` and unwraps the per-symbol map — **a missing
  key maps to `AssetNotFound`** (Alpaca's silent omission). Crypto bars page schema differs
  (map-of-arrays + top-level token); same `BarFromWire` bar shape is reused.
- Port signatures just widen to `AnySymbol`; routing by symbol class happens inside the adapter.
- Test broker gains crypto fixtures (asset with min sizes, slashless position wire, per-symbol
  data maps) and accepts crypto orders.

### Untouched

Clock/calendar (documented as equities-only), auth, envelope, retry recipes, pagination for
orders, metrics, the orchestrator-facing route list (same endpoints, wider symbols).

## Milestones

1. **Symbol model + class-aware domain.** `CryptoSymbol`/`AnySymbol`/`SymbolFromPath` codec +
   quote-suffix normalization helpers, asset schema fields, class-aware order validation, unit
   tests for codec edge cases (`BRK-B` vs `BTC-USD`) and crypto order rejections (day TIF,
   extended hours, stop type).
   *DoD:* typecheck/tests/lint green; equity behavior provably unchanged (existing suite).
2. **Adapter + test broker.** Wire translations, crypto data REST (latest quote/trade, snapshot,
   bars with real token), position/asset normalization, crypto fixtures + contract tests
   (crypto quote/snapshot/bars round-trip, silent-omission → 404, crypto order place/cancel via
   HTTP, position list showing canonical symbol).
   *DoD:* full suite green; crypto bars token round-trips against fixtures.
3. **Service/HTTP + live verify.** Rails/tradability for crypto (cache keyed on canonical
   symbol), dash-form paths end-to-end, OpenAPI regen; smoke gains a **full live crypto
   lifecycle**: asset → snapshot → bars → market buy (~$2 notional BTC/USD, fills immediately
   24/7) → position visible → close → position gone. This also finally live-verifies the
   position-close path deferred since M5.
   *DoD:* live paper run shows fill + close; all tests green; openapi.json artifact updated.
4. **Docs extraction.** Concepts doc gains a crypto section (pairs, 24/7, fees, no shorting);
   architecture.md gains the symbol model + crypto data seam; README updates (symbols in paths,
   fees, crypto env notes); this plan marked historical.
   *DoD:* docs merged, plan header flipped, committed and pushed.
