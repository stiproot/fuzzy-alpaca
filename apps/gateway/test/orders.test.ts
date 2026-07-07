import { HttpClient, HttpClientRequest } from "@effect/platform"
import { NodeHttpServer } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, Layer } from "effect"
import { HttpAppLive } from "../src/adapters/inbound/http/server.js"
import { AlpacaClientTest, type AlpacaClientTestOptions } from "../src/adapters/outbound/alpaca/testing.js"
import { AlpacaTimeout, AlpacaUnavailable } from "../src/domain/errors.js"

const TEST_API_KEY = "test-api-key"

const TestConfig = Layer.setConfigProvider(
  ConfigProvider.fromMap(
    new Map([
      ["SERVICE_API_KEY", TEST_API_KEY],
      ["APCA_API_KEY_ID", "PKTEST"],
      ["APCA_API_SECRET_KEY", "secret"],
      ["ALPACA_LIVE", "false"],
      ["MAX_ORDER_QTY", "100"],
      ["MAX_ORDER_NOTIONAL", "10000"],
    ])
  )
)

const makeServer = (options: AlpacaClientTestOptions = {}) =>
  HttpAppLive.pipe(
    Layer.provide(AlpacaClientTest(options)),
    Layer.provideMerge(NodeHttpServer.layerTest),
    Layer.provide(TestConfig)
  )

const orderBody = (clientOrderId: string, overrides: Record<string, unknown> = {}) => ({
  symbol: "AAPL",
  side: "buy",
  type: "market",
  timeInForce: "day",
  qty: "1",
  clientOrderId,
  ...overrides,
})

const post = (body: unknown) =>
  Effect.flatMap(HttpClient.HttpClient, (client) =>
    HttpClientRequest.post("/v1/orders").pipe(
      HttpClientRequest.setHeader("x-api-key", TEST_API_KEY),
      HttpClientRequest.bodyUnsafeJson(body),
      client.execute
    )
  )

const del = (path: string) =>
  Effect.flatMap(HttpClient.HttpClient, (client) =>
    client.execute(
      HttpClientRequest.del(path).pipe(HttpClientRequest.setHeader("x-api-key", TEST_API_KEY))
    )
  )

it.layer(makeServer())("orders happy paths", (it) => {
  it.effect("POST /v1/orders → 201 with domain order + meta", () =>
    Effect.gen(function* () {
      const response = yield* post(orderBody("happy-1"))
      expect(response.status).toBe(201)
      const body: any = yield* response.json
      expect(body.orderId).toMatch(/^[0-9a-f-]{36}$/)
      expect(body.clientOrderId).toBe("happy-1")
      expect(body.status).toBe("accepted")
      expect(body.qty).toBe("1")
      expect(body.notional).toBeNull()
      expect(body.tradingMode).toBe("paper")
      expect(body.idempotentReplay).toBe(false)
    })
  )

  it.effect("duplicate clientOrderId → idempotent replay of same order", () =>
    Effect.gen(function* () {
      const first = yield* post(orderBody("dup-1"))
      const firstBody: any = yield* first.json
      const second = yield* post(orderBody("dup-1"))
      expect(second.status).toBe(201)
      const secondBody: any = yield* second.json
      expect(secondBody.idempotentReplay).toBe(true)
      expect(secondBody.orderId).toBe(firstBody.orderId)
    })
  )

  it.effect("DELETE /v1/orders/:id cancels; repeat cancel returns current state", () =>
    Effect.gen(function* () {
      const created: any = yield* post(orderBody("cancel-1")).pipe(Effect.flatMap((r) => r.json))
      const canceled = yield* del(`/v1/orders/${created.orderId}`)
      expect(canceled.status).toBe(200)
      const canceledBody: any = yield* canceled.json
      expect(canceledBody.status).toBe("canceled")
      expect(canceledBody.canceledAt).not.toBeNull()

      // cancel-of-canceled → 200 with current state, not an error
      const again = yield* del(`/v1/orders/${created.orderId}`)
      expect(again.status).toBe(200)
      const againBody: any = yield* again.json
      expect(againBody.status).toBe("canceled")
    })
  )

  it.effect("cancel unknown order → 404 OrderNotFound envelope", () =>
    Effect.gen(function* () {
      const response = yield* del("/v1/orders/00000000-0000-4000-8000-999999999999")
      expect(response.status).toBe(404)
      const body: any = yield* response.json
      expect(body.error.code).toBe("OrderNotFound")
      expect(body.error.retryable).toBe(false)
    })
  )

  it.effect("cancel-all without confirm → 409 ConfirmationRequired; with confirm cancels", () =>
    Effect.gen(function* () {
      yield* post(orderBody("bulk-1"))
      yield* post(orderBody("bulk-2"))

      const gated = yield* del("/v1/orders")
      expect(gated.status).toBe(409)
      const gatedBody: any = yield* gated.json
      expect(gatedBody.error.code).toBe("ConfirmationRequired")

      const confirmed = yield* del("/v1/orders?confirm=true")
      expect(confirmed.status).toBe(200)
      const confirmedBody: any = yield* confirmed.json
      expect(confirmedBody.results.length).toBeGreaterThanOrEqual(2)
      expect(confirmedBody.results[0].status).toBe(200)
    })
  )

  it.effect("malformed bodies → 400 (strict schema)", () =>
    Effect.gen(function* () {
      // qty AND notional
      const both = yield* post(orderBody("bad-1", { notional: "50" }))
      expect(both.status).toBe(400)
      // unknown key
      const extra = yield* post(orderBody("bad-2", { quantity: "5" }))
      expect(extra.status).toBe(400)
      // limit order without limitPrice
      const noLimit = yield* post(orderBody("bad-3", { type: "limit" }))
      expect(noLimit.status).toBe(400)
      // missing clientOrderId
      const { clientOrderId: _omit, ...rest } = orderBody("bad-4")
      const noCid = yield* post(rest)
      expect(noCid.status).toBe(400)
    })
  )
})

// Broker configured so any createOrder reaching Alpaca fails 503 — proves the
// guard rails reject BEFORE the order hits the broker.
it.layer(
  makeServer({ failCreate: new AlpacaUnavailable({ message: "should never be reached" }) })
)("order guard rails (broker unreachable sentinel)", (it) => {
  it.effect("oversized qty → 422 MaxOrderSizeExceeded without hitting Alpaca", () =>
    Effect.gen(function* () {
      const response = yield* post(orderBody("rails-1", { qty: "101" }))
      expect(response.status).toBe(422)
      const body: any = yield* response.json
      expect(body.error.code).toBe("MaxOrderSizeExceeded")
    })
  )

  it.effect("oversized notional → 422 MaxOrderSizeExceeded", () =>
    Effect.gen(function* () {
      const { qty: _omit, ...rest } = orderBody("rails-2")
      const response = yield* post({ ...rest, notional: "10001" })
      expect(response.status).toBe(422)
      const body: any = yield* response.json
      expect(body.error.code).toBe("MaxOrderSizeExceeded")
    })
  )

  it.effect("non-tradable asset → 422 AssetNotTradable without hitting Alpaca", () =>
    Effect.gen(function* () {
      const response = yield* post(orderBody("rails-3", { symbol: "HALT" }))
      expect(response.status).toBe(422)
      const body: any = yield* response.json
      expect(body.error.code).toBe("AssetNotTradable")
    })
  )

  it.effect("unknown asset → 404 AssetNotFound without hitting Alpaca", () =>
    Effect.gen(function* () {
      const response = yield* post(orderBody("rails-4", { symbol: "ZZZZ" }))
      expect(response.status).toBe(404)
      const body: any = yield* response.json
      expect(body.error.code).toBe("AssetNotFound")
    })
  )
})

// Submission succeeded at Alpaca but the response was lost. The service must
// reconcile via clientOrderId — never resubmit.
it.layer(
  makeServer({
    failCreateAfterSubmitOnce: new AlpacaTimeout({ message: "response lost", op: "createOrder" }),
  })
)("ambiguous submission reconciliation", (it) => {
  it.effect("timeout after submit → replayed order, no server-side resubmit", () =>
    Effect.gen(function* () {
      const response = yield* post(orderBody("ambig-1"))
      expect(response.status).toBe(201)
      const body: any = yield* response.json
      expect(body.idempotentReplay).toBe(true)
      expect(body.clientOrderId).toBe("ambig-1")

      // resend with the same key (what the agent would do) → same single order
      const resend = yield* post(orderBody("ambig-1"))
      const resendBody: any = yield* resend.json
      expect(resendBody.idempotentReplay).toBe(true)
      expect(resendBody.orderId).toBe(body.orderId)
    })
  )
})

// Broker down entirely at submit: no order recorded → agent told to retry.
it.layer(
  makeServer({ failCreate: new AlpacaUnavailable({ message: "connection refused" }) })
)("ambiguous submission with nothing recorded", (it) => {
  it.effect("unavailable + no order found → 503 retryable, agent owns the retry", () =>
    Effect.gen(function* () {
      const response = yield* post(orderBody("ambig-2"))
      expect(response.status).toBe(503)
      const body: any = yield* response.json
      expect(body.error.code).toBe("AlpacaUnavailable")
      expect(body.error.retryable).toBe(true)
      expect(body.error.message).toContain("same clientOrderId")
    })
  )
})

// Cancel of a filled order is a real 409.
it.layer(
  makeServer({
    onCreateStatus: (req) => (req.clientOrderId.startsWith("fill-") ? "filled" : "accepted"),
  })
)("cancel filled order", (it) => {
  it.effect("filled → 409 OrderNotCancelable", () =>
    Effect.gen(function* () {
      const created: any = yield* post(orderBody("fill-1")).pipe(Effect.flatMap((r) => r.json))
      const response = yield* del(`/v1/orders/${created.orderId}`)
      expect(response.status).toBe(409)
      const body: any = yield* response.json
      expect(body.error.code).toBe("OrderNotCancelable")
    })
  )
})
