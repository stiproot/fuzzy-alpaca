import { HttpClient, HttpClientRequest } from "@effect/platform"
import { NodeHttpServer } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, Layer } from "effect"
import { HttpAppLive } from "../src/adapters/inbound/http/server.js"
import { AlpacaClientTest } from "../src/adapters/outbound/alpaca/testing.js"

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

const post = (body: unknown) =>
  Effect.flatMap(HttpClient.HttpClient, (client) =>
    HttpClientRequest.post("/v1/orders").pipe(auth, HttpClientRequest.bodyUnsafeJson(body), client.execute)
  )

const get = (path: string) =>
  Effect.flatMap(HttpClient.HttpClient, (client) => client.execute(HttpClientRequest.get(path).pipe(auth)))

const patch = (path: string, body: unknown) =>
  Effect.flatMap(HttpClient.HttpClient, (client) =>
    HttpClientRequest.patch(path).pipe(auth, HttpClientRequest.bodyUnsafeJson(body), client.execute)
  )

const del = (path: string) =>
  Effect.flatMap(HttpClient.HttpClient, (client) => client.execute(HttpClientRequest.del(path).pipe(auth)))

const orderBody = (clientOrderId: string, overrides: Record<string, unknown> = {}) => ({
  symbol: "AAPL",
  side: "buy",
  type: "limit",
  timeInForce: "day",
  qty: "1",
  limitPrice: "1.00",
  clientOrderId,
  ...overrides,
})

const seedAapl = (n: number, prefix: string) =>
  Effect.forEach(
    Array.from({ length: n }, (_, i) => i + 1),
    (i) =>
      post(orderBody(`${prefix}-${i}`, i % 2 === 0 ? { side: "sell" } : {})).pipe(
        Effect.flatMap((r) => r.json)
      ),
    { concurrency: 1 }
  )

it.layer(TestServer)("order reads", (it) => {
  it.effect("list, filters, cursor pagination, get, replace, lifecycle", () =>
    Effect.gen(function* () {
      // --- seed 5 orders (3 buy, 2 sell), sequential timestamps
      const seeded: any[] = yield* seedAapl(5, "read")
      expect(seeded).toHaveLength(5)

      // --- default list: open orders, desc
      const listRes = yield* get("/v1/orders")
      expect(listRes.status).toBe(200)
      const list: any = yield* listRes.json
      expect(list.items).toHaveLength(5)
      expect(list.nextPageToken).toBeUndefined()
      // desc: newest first
      expect(list.items[0].clientOrderId).toBe("read-5")

      // --- side filter
      const sells: any = yield* get("/v1/orders?side=sell").pipe(Effect.flatMap((r) => r.json))
      expect(sells.items).toHaveLength(2)
      expect(sells.items.every((o: any) => o.side === "sell")).toBe(true)

      // --- cursor pagination: limit=2 → token → next page continues
      const page1: any = yield* get("/v1/orders?limit=2").pipe(Effect.flatMap((r) => r.json))
      expect(page1.items).toHaveLength(2)
      expect(page1.nextPageToken).toBeDefined()
      expect(page1.items.map((o: any) => o.clientOrderId)).toEqual(["read-5", "read-4"])

      const page2: any = yield* get(
        `/v1/orders?limit=2&pageToken=${encodeURIComponent(page1.nextPageToken)}`
      ).pipe(Effect.flatMap((r) => r.json))
      expect(page2.items.map((o: any) => o.clientOrderId)).toEqual(["read-3", "read-2"])

      // --- garbage pageToken → 400 envelope
      const badToken = yield* get("/v1/orders?pageToken=garbage")
      expect(badToken.status).toBe(400)
      const badTokenBody: any = yield* badToken.json
      expect(badTokenBody.error.code).toBe("ValidationError")

      // --- get by id and by clientOrderId
      const byId: any = yield* get(`/v1/orders/${seeded[0].orderId}`).pipe(
        Effect.flatMap((r) => r.json)
      )
      expect(byId.clientOrderId).toBe("read-1")

      const byCid: any = yield* get("/v1/orders/read-3?byClientOrderId=true").pipe(
        Effect.flatMap((r) => r.json)
      )
      expect(byCid.clientOrderId).toBe("read-3")

      // non-uuid without the flag → 400 with guidance
      const badId = yield* get("/v1/orders/read-3")
      expect(badId.status).toBe(400)
      const badIdBody: any = yield* badId.json
      expect(badIdBody.error.code).toBe("ValidationError")
      expect(badIdBody.error.message).toContain("byClientOrderId")

      // unknown order → 404 envelope
      const missing = yield* get("/v1/orders/00000000-0000-4000-8000-999999999999")
      expect(missing.status).toBe(404)
      const missingBody: any = yield* missing.json
      expect(missingBody.error.code).toBe("OrderNotFound")
      expect(missingBody.error.retryable).toBe(false)

      // --- lifecycle: place → replace → cancel
      const placed: any = yield* post(orderBody("life-1")).pipe(Effect.flatMap((r) => r.json))

      const replacedRes = yield* patch(`/v1/orders/${placed.orderId}`, { limitPrice: "2.00" })
      expect(replacedRes.status).toBe(200)
      const replaced: any = yield* replacedRes.json
      expect(replaced.orderId).not.toBe(placed.orderId)
      expect(replaced.replacesOrderId).toBe(placed.orderId)
      expect(replaced.limitPrice).toBe("2.00")
      expect(replaced.status).toBe("accepted")

      // old order now shows the replacement link
      const oldOrder: any = yield* get(`/v1/orders/${placed.orderId}`).pipe(
        Effect.flatMap((r) => r.json)
      )
      expect(oldOrder.status).toBe("replaced")
      expect(oldOrder.replacedByOrderId).toBe(replaced.orderId)

      // replace of a replaced order → 409
      const replaceAgain = yield* patch(`/v1/orders/${placed.orderId}`, { limitPrice: "3.00" })
      expect(replaceAgain.status).toBe(409)
      const replaceAgainBody: any = yield* replaceAgain.json
      expect(replaceAgainBody.error.code).toBe("OrderNotCancelable")

      // cancel the replacement → canceled
      const canceled: any = yield* del(`/v1/orders/${replaced.orderId}`).pipe(
        Effect.flatMap((r) => r.json)
      )
      expect(canceled.status).toBe("canceled")

      // --- replace validation: empty body → 400
      const emptyReplace = yield* patch(`/v1/orders/${replaced.orderId}`, {})
      expect(emptyReplace.status).toBe(400)

      // replace unknown → 404
      const replaceMissing = yield* patch("/v1/orders/00000000-0000-4000-8000-999999999999", {
        limitPrice: "2.00",
      })
      expect(replaceMissing.status).toBe(404)
    })
  )
})
