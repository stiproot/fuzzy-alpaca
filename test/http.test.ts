import { HttpClient } from "@effect/platform"
import { NodeHttpServer } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, Layer } from "effect"
import { HttpAppLive } from "../src/adapters/inbound/http/server.js"

const TEST_API_KEY = "test-api-key"

const TestConfig = Layer.setConfigProvider(
  ConfigProvider.fromMap(
    new Map([
      ["SERVICE_API_KEY", TEST_API_KEY],
      ["ALPACA_LIVE", "false"],
    ])
  )
)

const TestServer = HttpAppLive.pipe(
  Layer.provideMerge(NodeHttpServer.layerTest),
  Layer.provide(TestConfig)
)

it.layer(TestServer)("http contract", (it) => {
  it.effect("GET /health requires no auth and reports trading mode", () =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const response = yield* client.get("/health")
      expect(response.status).toBe(200)
      expect(response.headers["x-request-id"]).toBeDefined()
      const body: any = yield* response.json
      expect(body.status).toBe("ok")
      expect(body.tradingMode).toBe("paper")
      expect(body.alpacaConnectivity).toBe("unknown")
      expect(typeof body.timestamp).toBe("string")
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
      expect(typeof body.error.message).toBe("string")
    })
  )

  it.effect("GET /v1/whoami with wrong key → 401 envelope", () =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const response = yield* client.get("/v1/whoami", {
        headers: { "x-api-key": "wrong-key" },
      })
      expect(response.status).toBe(401)
      const body: any = yield* response.json
      expect(body.error.code).toBe("Unauthorized")
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
