import { HttpClient } from "@effect/platform"
import { NodeHttpServer } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, Layer } from "effect"
import { HttpAppLive } from "../src/adapters/inbound/http/server.js"
import { AlpacaClientTest, wireClockFixture } from "../src/adapters/outbound/alpaca/testing.js"
import { AlpacaUnavailable } from "../src/domain/errors.js"

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

const makeServer = (broker: Layer.Layer<import("../src/ports/broker.js").AlpacaClient>) =>
  HttpAppLive.pipe(
    Layer.provide(broker),
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provide(TestConfig)
  )

it.layer(makeServer(AlpacaClientTest()))("http contract", (it) => {
  it.effect("GET /health requires no auth and probes Alpaca connectivity", () =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const response = yield* client.get("/health")
      expect(response.status).toBe(200)
      expect(response.headers["x-request-id"]).toBeDefined()
      const body: any = yield* response.json
      expect(body.status).toBe("ok")
      expect(body.tradingMode).toBe("paper")
      expect(body.alpacaConnectivity).toBe("ok")
    })
  )

  it.effect("GET /v1/whoami without key → 401 envelope", () =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const response = yield* client.get("/v1/whoami")
      expect(response.status).toBe(401)
      const body: any = yield* response.json
      expect(body.error.code).toBe("Unauthorized")
      expect(body.error.retryable).toBe(false)
    })
  )

  it.effect("GET /v1/account with wrong key → 401 envelope", () =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const response = yield* client.get("/v1/account", {
        headers: { "x-api-key": "wrong-key" },
      })
      expect(response.status).toBe(401)
      const body: any = yield* response.json
      expect(body.error.code).toBe("Unauthorized")
    })
  )

  it.effect("GET /v1/account returns decoded camelCase domain JSON", () =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const response = yield* client.get("/v1/account", {
        headers: { "x-api-key": TEST_API_KEY },
      })
      expect(response.status).toBe(200)
      const body: any = yield* response.json
      expect(body.accountNumber).toBe("PA3TESTFIXTURE")
      expect(body.buyingPower).toBe("200000")
      expect(body.patternDayTrader).toBe(false)
      expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/)
      expect(body.account_number).toBeUndefined()
    })
  )

  it.effect("GET /v1/clock returns decoded clock with UTC timestamps", () =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const response = yield* client.get("/v1/clock", {
        headers: { "x-api-key": TEST_API_KEY },
      })
      expect(response.status).toBe(200)
      const body: any = yield* response.json
      expect(body.isOpen).toBe(wireClockFixture.is_open)
      // -04:00 wire offset normalized to UTC
      expect(body.timestamp).toBe("2026-07-06T19:30:00.000Z")
      expect(body.nextClose).toBe("2026-07-06T20:00:00.000Z")
    })
  )

  it.effect("GET /v1/whoami with correct key → 200", () =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const response = yield* client.get("/v1/whoami", {
        headers: { "x-api-key": TEST_API_KEY },
      })
      expect(response.status).toBe(200)
      const body: any = yield* response.json
      expect(body).toEqual({ authenticated: true, tradingMode: "paper" })
    })
  )

  it.effect("x-request-id is echoed back when supplied", () =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const response = yield* client.get("/health", {
        headers: { "x-request-id": "req-42" },
      })
      expect(response.headers["x-request-id"]).toBe("req-42")
    })
  )

  it.effect("GET /docs serves Swagger UI", () =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const response = yield* client.get("/docs")
      expect(response.status).toBe(200)
    })
  )
})

const failing = AlpacaClientTest({
  failClock: new AlpacaUnavailable({ message: "Alpaca 502 during getClock" }),
  failAccount: new AlpacaUnavailable({ message: "Alpaca 502 during getAccount" }),
})

it.layer(makeServer(failing))("http contract with Alpaca down", (it) => {
  it.effect("health degrades instead of failing", () =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const response = yield* client.get("/health")
      expect(response.status).toBe(200)
      const body: any = yield* response.json
      expect(body.alpacaConnectivity).toBe("degraded")
    })
  )

  it.effect("GET /v1/account → 503 retryable envelope", () =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const response = yield* client.get("/v1/account", {
        headers: { "x-api-key": TEST_API_KEY },
      })
      expect(response.status).toBe(503)
      const body: any = yield* response.json
      expect(body.error.code).toBe("AlpacaUnavailable")
      expect(body.error.retryable).toBe(true)
    })
  )
})
