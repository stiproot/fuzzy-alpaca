import { NodeHttpClient } from "@effect/platform-node"
import { Effect, Layer, Option, Schema } from "effect"
import { AlpacaClientLive } from "../src/adapters/outbound/alpaca/live.js"
import { MarketDataService } from "../src/application/market-data/service.js"
import { TradingService } from "../src/application/trading/service.js"
import { AppConfig } from "../src/config.js"
import { AnySymbol, TickerSymbol } from "../src/domain/primitives.js"
import { CreateOrderRequest, ReplaceOrderRequest } from "../src/domain/schemas/order.js"
import { AlpacaClient } from "../src/ports/broker.js"

// Paper-account smoke — exercises the real Alpaca API; not run in CI.
// Scope grows with each milestone: clock → account → order lifecycle.
const program = Effect.gen(function* () {
  const broker = yield* AlpacaClient
  const trading = yield* TradingService

  const clock = yield* broker.getClock()
  yield* Effect.logInfo("clock decoded", {
    isOpen: clock.isOpen,
    nextOpen: clock.nextOpen.toString(),
    nextClose: clock.nextClose.toString(),
  })

  const account = yield* broker.getAccount()
  yield* Effect.logInfo("account decoded", {
    status: account.status,
    buyingPower: account.buyingPower,
    equity: account.equity,
  })

  // Market intelligence: asset → snapshot → quote → bars (token round-trip) → calendar
  const marketData = yield* MarketDataService
  const aapl = yield* Schema.decodeUnknown(TickerSymbol)("AAPL")

  const asset = yield* marketData.getAsset(aapl)
  yield* Effect.logInfo("asset", {
    found: Option.isSome(asset),
    tradable: Option.isSome(asset) ? asset.value.tradable : null,
  })

  const snapshot = yield* marketData.getSnapshot(aapl)
  yield* Effect.logInfo("snapshot", {
    hasQuote: Option.isSome(snapshot.latestQuote),
    dailyClose: Option.map(snapshot.dailyBar, (b) => b.close),
  })

  const quote = yield* marketData.getQuote(aapl)
  yield* Effect.logInfo("latest quote", { ask: quote.askPrice, bid: quote.bidPrice })

  const bars1 = yield* marketData.getBars(aapl, { timeframe: "1Day", start: "2026-06-20", end: "2026-07-03", limit: 3 })
  const bars2 =
    bars1.nextPageToken !== undefined
      ? yield* marketData.getBars(aapl, {
          timeframe: "1Day",
          start: "2026-06-20",
          end: "2026-07-03",
          limit: 3,
          pageToken: bars1.nextPageToken,
        })
      : undefined
  yield* Effect.logInfo("bars pagination", {
    page1: bars1.items.length,
    hadToken: bars1.nextPageToken !== undefined,
    page2: bars2?.items.length ?? 0,
    page1LastClose: bars1.items[bars1.items.length - 1]?.close,
    page2FirstClose: bars2?.items[0]?.close,
  })

  const calendar = yield* marketData.getCalendar({ start: "2026-07-06", end: "2026-07-10" })
  yield* Effect.logInfo("calendar", { days: calendar.map((d) => d.date) })

  // Positions: read-only against the live account (closing real positions is
  // reserved for the market-hours full smoke in milestone 6).
  const positions = yield* trading.listPositions()
  yield* Effect.logInfo("positions", {
    count: positions.length,
    symbols: positions.map((p) => p.symbol),
  })
  const noPosition = yield* trading.getPosition(yield* Schema.decodeUnknown(TickerSymbol)("ZZZZ"))
  yield* Effect.logInfo("unknown position lookup", { isNone: Option.isNone(noPosition) })

  // Order lifecycle: limit buy far below market so it can never fill,
  // then idempotent replay, then cancel.
  const clientOrderId = `smoke-${process.env["SMOKE_RUN_ID"] ?? Date.now()}`
  const request = yield* Schema.decodeUnknown(CreateOrderRequest)({
    symbol: "AAPL",
    side: "buy",
    type: "limit",
    timeInForce: "day",
    qty: "1",
    limitPrice: "1.00",
    clientOrderId,
  })

  const placed = yield* trading.placeOrder(request)
  yield* Effect.logInfo("order placed", {
    orderId: placed.orderId,
    status: placed.status,
    idempotentReplay: placed.idempotentReplay,
  })

  const replayed = yield* trading.placeOrder(request)
  yield* Effect.logInfo("replay", {
    orderId: replayed.orderId,
    idempotentReplay: replayed.idempotentReplay,
    sameOrder: replayed.orderId === placed.orderId,
  })

  // Reads: list + lookup by clientOrderId
  const page = yield* trading.listOrders({ status: "open", limit: 50 })
  yield* Effect.logInfo("open orders", {
    count: page.items.length,
    containsPlaced: page.items.some((o) => o.orderId === placed.orderId),
  })
  const byCid = yield* trading.getOrderFlexible(clientOrderId, true)
  yield* Effect.logInfo("lookup by clientOrderId", { found: byCid.orderId === placed.orderId })

  // Replace, tolerating market-state rejection outside trading hours
  const cancelTarget = yield* trading
    .replaceOrder(placed.orderId, yield* Schema.decodeUnknown(ReplaceOrderRequest)({ limitPrice: "1.05" }))
    .pipe(
      Effect.tap((replaced) =>
        Effect.logInfo("replaced", {
          newOrderId: replaced.orderId,
          replaces: replaced.replacesOrderId,
          limitPrice: replaced.limitPrice,
        })
      ),
      Effect.map((replaced) => replaced.orderId),
      Effect.catchTag("OrderNotCancelable", (e) =>
        Effect.logWarning("replace rejected by Alpaca (likely market closed)", {
          message: e.message,
        }).pipe(Effect.as(placed.orderId))
      )
    )

  const canceled = yield* trading.cancelOrder(cancelTarget)
  yield* Effect.logInfo("canceled", { orderId: canceled.orderId, status: canceled.status })

  // ---- Crypto: 24/7, so the FULL lifecycle is live-verifiable any day ----
  const btc = yield* Schema.decodeUnknown(AnySymbol)("BTC/USD")

  const cryptoAsset = yield* marketData.getAsset(btc)
  yield* Effect.logInfo("crypto asset", {
    found: Option.isSome(cryptoAsset),
    minOrderSize: Option.isSome(cryptoAsset) ? cryptoAsset.value.minOrderSize : null,
  })

  const cryptoSnap = yield* marketData.getSnapshot(btc)
  yield* Effect.logInfo("crypto snapshot", {
    lastPrice: Option.map(cryptoSnap.latestTrade, (t) => t.price),
  })

  const cryptoBars = yield* marketData.getBars(btc, { timeframe: "1Min", limit: 3, start: "2026-07-05" })
  const cryptoBars2 =
    cryptoBars.nextPageToken !== undefined
      ? yield* marketData.getBars(btc, {
          timeframe: "1Min",
          limit: 3,
          start: "2026-07-05",
          pageToken: cryptoBars.nextPageToken,
        })
      : undefined
  yield* Effect.logInfo("crypto bars", {
    page1: cryptoBars.items.length,
    hadToken: cryptoBars.nextPageToken !== undefined,
    page2: cryptoBars2?.items.length ?? 0,
  })

  const existingBtc = yield* trading.getPosition(btc)
  if (Option.isSome(existingBtc)) {
    yield* Effect.logWarning("existing BTC position found — skipping lifecycle to avoid touching real holdings", {
      qty: existingBtc.value.qty,
    })
  } else {
    const cryptoOrder = yield* Schema.decodeUnknown(CreateOrderRequest)({
      symbol: "BTC/USD",
      side: "buy",
      type: "market",
      timeInForce: "gtc",
      // paper crypto orders require ≥$10 cost basis; 0.0002 BTC ≈ $13
      qty: "0.0002",
      clientOrderId: `smoke-crypto-${process.env["SMOKE_RUN_ID"] ?? Date.now()}`,
    })
    const cryptoPlaced = yield* trading.placeOrder(cryptoOrder)
    yield* Effect.logInfo("crypto order placed", {
      orderId: cryptoPlaced.orderId,
      status: cryptoPlaced.status,
    })

    // market crypto orders fill in seconds
    let filled = false
    for (let attempt = 0; attempt < 10 && !filled; attempt++) {
      yield* Effect.sleep("1 second")
      const current = yield* trading.getOrderFlexible(cryptoPlaced.orderId, false)
      filled = current.status === "filled"
      if (filled) {
        yield* Effect.logInfo("crypto order filled", {
          filledQty: current.filledQty,
          filledAvgPrice: Option.getOrNull(current.filledAvgPrice),
        })
      }
    }
    if (!filled) {
      yield* Effect.logWarning("crypto order not filled within 10s — canceling and skipping close")
      yield* trading.cancelOrder(cryptoPlaced.orderId as never).pipe(Effect.ignore)
    } else {
      const btcPosition = yield* trading.getPosition(btc)
      yield* Effect.logInfo("crypto position", {
        present: Option.isSome(btcPosition),
        qty: Option.isSome(btcPosition) ? btcPosition.value.qty : null,
        symbol: Option.isSome(btcPosition) ? btcPosition.value.symbol : null,
      })

      const liquidation = yield* trading.closePosition(btc, {})
      yield* Effect.logInfo("crypto position closed", {
        liquidationOrderId: liquidation.orderId,
        side: liquidation.side,
        status: liquidation.status,
      })

      yield* Effect.sleep("2 seconds")
      const after = yield* trading.getPosition(btc)
      yield* Effect.logInfo("crypto position after close", { gone: Option.isNone(after) })
    }
  }

  yield* Effect.logInfo("SMOKE OK")
})

program.pipe(
  Effect.provide(
    TradingService.Default.pipe(
      Layer.provideMerge(MarketDataService.Default),
      Layer.provideMerge(AlpacaClientLive),
      Layer.provideMerge(AppConfig.Default),
      Layer.provide(NodeHttpClient.layer)
    )
  ),
  Effect.runPromise
).catch((error) => {
  console.error("SMOKE FAILED", error)
  process.exit(1)
})
