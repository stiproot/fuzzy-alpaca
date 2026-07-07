import { HttpClient, HttpClientRequest, OpenApi } from "@effect/platform"
import { NodeHttpServer } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, Fiber, Layer, TestClock } from "effect"
import { describe, expect as vexpect, it as vit } from "vitest"
import { Api } from "../src/adapters/inbound/http/api.js"
import { HttpAppLive } from "../src/adapters/inbound/http/server.js"
import { alpacaCall } from "../src/adapters/outbound/alpaca/live.js"
import { AlpacaClientTest, wireClockFixture } from "../src/adapters/outbound/alpaca/testing.js"
import { ClockFromWire } from "../src/domain/schemas/clock.js"

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

it.layer(TestServer)("market data + assets + calendar + metrics", (it) => {
  it.effect("quote, trade, snapshot decode to domain shapes", () =>
    Effect.gen(function* () {
      const quote: any = yield* get("/v1/market-data/AAPL/quote").pipe(Effect.flatMap((r) => r.json))
      expect(quote.symbol).toBe("AAPL")
      expect(quote.askPrice).toBe(189.65)
      expect(quote.bidSize).toBe(2)
      expect(quote.ap).toBeUndefined()

      const trade: any = yield* get("/v1/market-data/AAPL/trade").pipe(Effect.flatMap((r) => r.json))
      expect(trade.price).toBe(189.62)
      expect(trade.size).toBe(100)

      const snapshot: any = yield* get("/v1/market-data/AAPL/snapshot").pipe(
        Effect.flatMap((r) => r.json)
      )
      expect(snapshot.latestQuote.askPrice).toBe(189.65)
      expect(snapshot.dailyBar.close).toBe(189)
      expect(snapshot.prevDailyBar.close).toBe(188)
    })
  )

  it.effect("bars pageToken round-trips until exhausted", () =>
    Effect.gen(function* () {
      const page1: any = yield* get("/v1/market-data/AAPL/bars?timeframe=1Day&limit=2").pipe(
        Effect.flatMap((r) => r.json)
      )
      expect(page1.items).toHaveLength(2)
      expect(page1.items[0].close).toBe(185)
      expect(page1.nextPageToken).toBeDefined()

      const page2: any = yield* get(
        `/v1/market-data/AAPL/bars?timeframe=1Day&limit=2&pageToken=${page1.nextPageToken}`
      ).pipe(Effect.flatMap((r) => r.json))
      expect(page2.items[0].close).toBe(187)
      expect(page2.nextPageToken).toBeDefined()

      const page3: any = yield* get(
        `/v1/market-data/AAPL/bars?timeframe=1Day&limit=2&pageToken=${page2.nextPageToken}`
      ).pipe(Effect.flatMap((r) => r.json))
      expect(page3.items).toHaveLength(1)
      expect(page3.items[0].close).toBe(189)
      expect(page3.nextPageToken).toBeUndefined()
    })
  )

  it.effect("bad timeframe → 400", () =>
    Effect.gen(function* () {
      const response = yield* get("/v1/market-data/AAPL/bars?timeframe=2Fortnights")
      expect(response.status).toBe(400)
    })
  )

  it.effect("assets: search + tradable filter + get + 404", () =>
    Effect.gen(function* () {
      const all: any = yield* get("/v1/assets").pipe(Effect.flatMap((r) => r.json))
      expect(all.totalMatches).toBe(3) // BTC/USD crypto + AAPL + HALT

      const tradable: any = yield* get("/v1/assets?tradable=true").pipe(Effect.flatMap((r) => r.json))
      expect(tradable.items).toHaveLength(2)
      expect(tradable.items.map((a: any) => a.symbol).sort()).toEqual(["AAPL", "BTC/USD"])

      const searched: any = yield* get("/v1/assets?search=aa").pipe(Effect.flatMap((r) => r.json))
      expect(searched.items).toHaveLength(1)

      const single: any = yield* get("/v1/assets/AAPL").pipe(Effect.flatMap((r) => r.json))
      expect(single.assetClass).toBe("us_equity")
      expect(single.easyToBorrow).toBe(true)

      const missing = yield* get("/v1/assets/ZZZZ")
      expect(missing.status).toBe(404)
      const missingBody: any = yield* missing.json
      expect(missingBody.error.code).toBe("AssetNotFound")
    })
  )

  it.effect("calendar returns trading days", () =>
    Effect.gen(function* () {
      const days: any = yield* get("/v1/calendar?start=2026-07-06&end=2026-07-07").pipe(
        Effect.flatMap((r) => r.json)
      )
      expect(days).toHaveLength(2)
      expect(days[0]).toEqual({ date: "2026-07-06", open: "09:30", close: "16:00" })
    })
  )

  it.effect("/metrics scrapes in Prometheus format without auth", () =>
    Effect.gen(function* () {
      // generate some traffic first
      yield* get("/health")
      const response = yield* Effect.flatMap(HttpClient.HttpClient, (client) =>
        client.execute(HttpClientRequest.get("/metrics"))
      )
      expect(response.status).toBe(200)
      const body = yield* response.text
      expect(body).toContain("# TYPE")
    })
  )
})

// The 20-route MVP surface is itself a contract: lock path+method set.
describe("openapi contract", () => {
  vit("exposes exactly the MVP surface", () => {
    const spec: any = OpenApi.fromApi(Api)
    const routes = Object.entries(spec.paths as Record<string, Record<string, unknown>>)
      .flatMap(([path, ops]) => Object.keys(ops).map((method) => `${method.toUpperCase()} ${path}`))
      .sort()
    vexpect(routes).toEqual(
      [
        "GET /health",
        "GET /metrics",
        "GET /v1/whoami",
        "GET /v1/account",
        "GET /v1/clock",
        "POST /v1/orders",
        "GET /v1/orders",
        "DELETE /v1/orders",
        "GET /v1/orders/{orderId}",
        "PATCH /v1/orders/{orderId}",
        "DELETE /v1/orders/{orderId}",
        "GET /v1/positions",
        "GET /v1/positions/{symbol}",
        "DELETE /v1/positions/{symbol}",
        "GET /v1/market-data/{symbol}/quote",
        "GET /v1/market-data/{symbol}/trade",
        "GET /v1/market-data/{symbol}/snapshot",
        "GET /v1/market-data/{symbol}/bars",
        "GET /v1/assets",
        "GET /v1/assets/{symbol}",
        "GET /v1/calendar",
      ].sort()
    )
  })
})

// 429 storm: consecutive rate limits, each with Retry-After, before success.
it.effect("double-429 storm honors each Retry-After", () =>
  Effect.gen(function* () {
    let calls = 0
    const reject429 = (after: string) =>
      Promise.reject({ message: "rate limited", response: { status: 429, data: {}, headers: { "retry-after": after } } })

    const fiber = yield* alpacaCall(
      "getClock",
      () => {
        calls++
        if (calls === 1) return reject429("2")
        if (calls === 2) return reject429("3")
        return Promise.resolve(wireClockFixture)
      },
      ClockFromWire
    ).pipe(Effect.fork)

    // needs ≥ 2s + backoff + 3s + backoff; 4s in it cannot be done
    yield* TestClock.adjust("4 seconds")
    expect(calls).toBeLessThanOrEqual(2)

    yield* TestClock.adjust("10 seconds")
    const clock = yield* Fiber.join(fiber)
    expect(clock.isOpen).toBe(true)
    expect(calls).toBe(3)
  })
)
