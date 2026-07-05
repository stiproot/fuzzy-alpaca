import { Effect, Layer } from "effect"
import { AlpacaClientLive } from "../src/adapters/outbound/alpaca/live.js"
import { AppConfig } from "../src/config.js"
import { AlpacaClient } from "../src/ports/broker.js"

// Paper-account smoke — exercises the real Alpaca API; not run in CI.
// Milestone 2 scope: clock + account. Grows with each milestone.
const program = Effect.gen(function* () {
  const broker = yield* AlpacaClient
  const clock = yield* broker.getClock()
  yield* Effect.logInfo("clock decoded", {
    isOpen: clock.isOpen,
    nextOpen: clock.nextOpen.toString(),
    nextClose: clock.nextClose.toString(),
  })
  const account = yield* broker.getAccount()
  yield* Effect.logInfo("account decoded", {
    status: account.status,
    currency: account.currency,
    buyingPower: account.buyingPower,
    equity: account.equity,
    patternDayTrader: account.patternDayTrader,
    daytradeCount: account.daytradeCount,
  })
  yield* Effect.logInfo("SMOKE OK")
})

program.pipe(
  Effect.provide(AlpacaClientLive.pipe(Layer.provideMerge(AppConfig.Default))),
  Effect.runPromise
).catch((error) => {
  console.error("SMOKE FAILED", error)
  process.exit(1)
})
