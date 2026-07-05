import { Effect, Layer, Schema } from "effect"
import { AlpacaClientLive } from "../src/adapters/outbound/alpaca/live.js"
import { TradingService } from "../src/application/trading/service.js"
import { AppConfig } from "../src/config.js"
import { CreateOrderRequest } from "../src/domain/schemas/order.js"
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

  const canceled = yield* trading.cancelOrder(placed.orderId)
  yield* Effect.logInfo("canceled", { orderId: canceled.orderId, status: canceled.status })

  yield* Effect.logInfo("SMOKE OK")
})

program.pipe(
  Effect.provide(
    TradingService.Default.pipe(
      Layer.provideMerge(AlpacaClientLive),
      Layer.provideMerge(AppConfig.Default)
    )
  ),
  Effect.runPromise
).catch((error) => {
  console.error("SMOKE FAILED", error)
  process.exit(1)
})
