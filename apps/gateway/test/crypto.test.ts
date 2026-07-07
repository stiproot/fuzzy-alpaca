import { HttpClient, HttpClientRequest } from "@effect/platform"
import { NodeHttpServer } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, Layer } from "effect"
import { describe, expect as vexpect, it as vit } from "vitest"
import { HttpAppLive } from "../src/adapters/inbound/http/server.js"
import { unwrapCryptoEntry } from "../src/adapters/outbound/alpaca/live.js"
import {
  AlpacaClientTest,
  wireCryptoPositionFixture,
  wirePositionFixture,
} from "../src/adapters/outbound/alpaca/testing.js"

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
  Layer.provide(
    AlpacaClientTest({ positions: [wirePositionFixture, wireCryptoPositionFixture] })
  ),
  Layer.provideMerge(NodeHttpServer.layerTest),
  Layer.provide(TestConfig)
)

const auth = HttpClientRequest.setHeader("x-api-key", TEST_API_KEY)

const get = (path: string) =>
  Effect.flatMap(HttpClient.HttpClient, (client) => client.execute(HttpClientRequest.get(path).pipe(auth)))

const del = (path: string) =>
  Effect.flatMap(HttpClient.HttpClient, (client) => client.execute(HttpClientRequest.del(path).pipe(auth)))

const post = (body: unknown) =>
  Effect.flatMap(HttpClient.HttpClient, (client) =>
    HttpClientRequest.post("/v1/orders").pipe(auth, HttpClientRequest.bodyUnsafeJson(body), client.execute)
  )

it.layer(TestServer)("crypto over HTTP", (it) => {
  it.effect("crypto market order placed with canonical symbol", () =>
    Effect.gen(function* () {
      const response = yield* post({
        symbol: "BTC/USD",
        side: "buy",
        type: "market",
        timeInForce: "gtc",
        qty: "0.001",
        clientOrderId: "crypto-order-1",
      })
      expect(response.status).toBe(201)
      const body: any = yield* response.json
      expect(body.symbol).toBe("BTC/USD")
      expect(body.status).toBe("accepted")
    })
  )

  it.effect("crypto order with day TIF → 400 before reaching the broker", () =>
    Effect.gen(function* () {
      const response = yield* post({
        symbol: "BTC/USD",
        side: "buy",
        type: "market",
        timeInForce: "day",
        qty: "0.001",
        clientOrderId: "crypto-order-2",
      })
      expect(response.status).toBe(400)
    })
  )

  it.effect("crypto position listed with canonical symbol (wire is slashless)", () =>
    Effect.gen(function* () {
      const list: any = yield* get("/v1/positions").pipe(Effect.flatMap((r) => r.json))
      const symbols = list.map((p: any) => p.symbol)
      expect(symbols).toContain("BTC/USD")
      expect(symbols).not.toContain("BTCUSD")
    })
  )

  it.effect("dash-form path resolves the crypto position; partial close works", () =>
    Effect.gen(function* () {
      const single: any = yield* get("/v1/positions/BTC-USD").pipe(Effect.flatMap((r) => r.json))
      expect(single.symbol).toBe("BTC/USD")
      expect(single.assetClass).toBe("crypto")
      expect(single.qty).toBe("0.5")

      const closed = yield* del("/v1/positions/BTC-USD?percentage=50")
      expect(closed.status).toBe(200)
      const closedBody: any = yield* closed.json
      expect(closedBody.symbol).toBe("BTC/USD")
      expect(closedBody.side).toBe("sell")

      const shrunk: any = yield* get("/v1/positions/BTC-USD").pipe(Effect.flatMap((r) => r.json))
      expect(shrunk.qty).toBe("0.25")
    })
  )

  it.effect("dash-form equity path still resolves equities", () =>
    Effect.gen(function* () {
      const aapl: any = yield* get("/v1/positions/AAPL").pipe(Effect.flatMap((r) => r.json))
      expect(aapl.symbol).toBe("AAPL")
    })
  )

  it.effect("crypto asset carries sizing constraints; dash path works", () =>
    Effect.gen(function* () {
      const asset: any = yield* get("/v1/assets/BTC-USD").pipe(Effect.flatMap((r) => r.json))
      expect(asset.symbol).toBe("BTC/USD")
      expect(asset.assetClass).toBe("crypto")
      expect(asset.minOrderSize).toBe("0.0001")
      expect(asset.marginable).toBe(false)
      expect(asset.shortable).toBe(false)
    })
  )

  it.effect("crypto market data via dash path", () =>
    Effect.gen(function* () {
      const quote: any = yield* get("/v1/market-data/BTC-USD/quote").pipe(
        Effect.flatMap((r) => r.json)
      )
      expect(quote.symbol).toBe("BTC/USD")
      expect(typeof quote.askPrice).toBe("number")
    })
  )
})

// The v1beta3 per-symbol envelope unwrap: present key → entry, missing → AssetNotFound.
describe("unwrapCryptoEntry", () => {
  vit("extracts the entry for the requested symbol", async () => {
    const raw = { quotes: { "BTC/USD": { ap: 1, bp: 2 } } }
    const entry = await Effect.runPromise(unwrapCryptoEntry("quotes", "BTC/USD")(raw))
    vexpect(entry).toEqual({ ap: 1, bp: 2 })
  })

  vit("missing symbol (silently omitted by Alpaca) → AssetNotFound", async () => {
    const raw = { quotes: {} }
    const error = await Effect.runPromise(
      unwrapCryptoEntry("quotes", "FOO/USD")(raw).pipe(Effect.flip)
    )
    vexpect(error._tag).toBe("AssetNotFound")
  })

  vit("malformed envelope → AssetNotFound rather than a crash", async () => {
    const error = await Effect.runPromise(
      unwrapCryptoEntry("quotes", "BTC/USD")(null).pipe(Effect.flip)
    )
    vexpect(error._tag).toBe("AssetNotFound")
  })
})
