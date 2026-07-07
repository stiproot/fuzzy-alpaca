import { HttpClient, HttpClientRequest } from "@effect/platform"
import { NodeHttpServer } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, HashMap, Layer, Logger, Schema } from "effect"
import { HttpAppLive } from "../src/adapters/inbound/http/server.js"
import { AlpacaClientTest } from "../src/adapters/outbound/alpaca/testing.js"
import { TradingService } from "../src/application/trading/service.js"
import { AppConfig } from "../src/config.js"
import { TickerSymbol } from "../src/domain/primitives.js"

const TEST_API_KEY = "test-api-key"

const TestConfig = Layer.setConfigProvider(
  ConfigProvider.fromMap(
    new Map([
      ["SERVICE_API_KEY", TEST_API_KEY],
      ["APCA_API_KEY_ID", "PKTEST"],
      ["APCA_API_SECRET_KEY", "secret"],
      ["ALPACA_LIVE", "false"],
    ])
  )
)

const TestServer = HttpAppLive.pipe(
  Layer.provide(AlpacaClientTest()),
  Layer.provideMerge(NodeHttpServer.layerTest),
  Layer.provide(TestConfig)
)

const auth = HttpClientRequest.setHeader("x-api-key", TEST_API_KEY)

const get = (path: string) =>
  Effect.flatMap(HttpClient.HttpClient, (client) => client.execute(HttpClientRequest.get(path).pipe(auth)))

const del = (path: string) =>
  Effect.flatMap(HttpClient.HttpClient, (client) => client.execute(HttpClientRequest.del(path).pipe(auth)))

it.layer(TestServer)("positions", (it) => {
  it.effect("list, get, partial close, full close, 404s", () =>
    Effect.gen(function* () {
      // --- list
      const list: any = yield* get("/v1/positions").pipe(Effect.flatMap((r) => r.json))
      expect(list).toHaveLength(1)
      expect(list[0].symbol).toBe("AAPL")
      expect(list[0].qty).toBe("10")
      expect(list[0].avgEntryPrice).toBe("150.00")
      expect(list[0].unrealizedPl).toBe("50.00")
      expect(list[0].avg_entry_price).toBeUndefined()

      // --- get by symbol
      const single: any = yield* get("/v1/positions/AAPL").pipe(Effect.flatMap((r) => r.json))
      expect(single.side).toBe("long")

      // --- unknown symbol → 404 PositionNotFound, retryable false
      const missing = yield* get("/v1/positions/TSLA")
      expect(missing.status).toBe(404)
      const missingBody: any = yield* missing.json
      expect(missingBody.error.code).toBe("PositionNotFound")
      expect(missingBody.error.retryable).toBe(false)

      // --- qty + percentage together → 400
      const both = yield* del("/v1/positions/AAPL?qty=1&percentage=50")
      expect(both.status).toBe(400)
      const bothBody: any = yield* both.json
      expect(bothBody.error.code).toBe("ValidationError")

      // --- partial close: 4 shares → liquidation sell order, position shrinks
      const partial = yield* del("/v1/positions/AAPL?qty=4")
      expect(partial.status).toBe(200)
      const partialBody: any = yield* partial.json
      expect(partialBody.side).toBe("sell")
      expect(partialBody.type).toBe("market")
      expect(partialBody.qty).toBe("4")
      expect(partialBody.tradingMode).toBe("paper")

      const shrunk: any = yield* get("/v1/positions/AAPL").pipe(Effect.flatMap((r) => r.json))
      expect(shrunk.qty).toBe("6")

      // --- percentage close of half → 3 shares
      const half = yield* del("/v1/positions/AAPL?percentage=50")
      const halfBody: any = yield* half.json
      expect(halfBody.qty).toBe("3")

      // --- full close → position gone
      const full = yield* del("/v1/positions/AAPL")
      expect(full.status).toBe(200)
      const fullBody: any = yield* full.json
      expect(fullBody.qty).toBe("3")

      const gone = yield* get("/v1/positions/AAPL")
      expect(gone.status).toBe(404)

      // --- close of nonexistent position → 404
      const closeMissing = yield* del("/v1/positions/TSLA")
      expect(closeMissing.status).toBe(404)
      const closeMissingBody: any = yield* closeMissing.json
      expect(closeMissingBody.error.code).toBe("PositionNotFound")
    })
  )
})

// Audit records are part of the close contract: assert them via a capturing logger.
const captured: Array<Record<string, unknown>> = []
const capturingLogger = Logger.make(({ message, annotations }) => {
  captured.push({
    message: Array.isArray(message) ? message.join(" ") : String(message),
    ...Object.fromEntries(HashMap.toEntries(annotations)),
  })
})

it.effect("closePosition emits an order.audit record", () =>
  Effect.gen(function* () {
    const symbol = yield* Schema.decodeUnknown(TickerSymbol)("AAPL")
    const trading = yield* TradingService
    yield* trading.closePosition(symbol, { qty: "2" })

    const audit = captured.find(
      (entry) => entry["message"] === "order.audit" && entry["action"] === "closePosition"
    )
    expect(audit).toBeDefined()
    expect(audit!["symbol"]).toBe("AAPL")
    expect(audit!["qty"]).toBe("2")
    expect(audit!["tradingMode"]).toBe("paper")
    expect(typeof audit!["outcome"]).toBe("string")
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        TradingService.Default.pipe(
          Layer.provide(AlpacaClientTest()),
          Layer.provide(AppConfig.Default),
          Layer.provide(TestConfig)
        ),
        Logger.replace(Logger.defaultLogger, capturingLogger)
      )
    )
  )
)
