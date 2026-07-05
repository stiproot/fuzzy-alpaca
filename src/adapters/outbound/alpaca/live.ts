import AlpacaModule from "@alpacahq/alpaca-trade-api"
import { Data, Duration, Effect, Layer, Option, ParseResult, Redacted, Schedule, Schema } from "effect"
import { AppConfig } from "../../../config.js"
import {
  AlpacaContractError,
  AlpacaTimeout,
  DuplicateClientOrderId,
  OrderNotCancelable,
  OrderNotFound,
  isRetryableAlpacaError,
  type AlpacaError,
} from "../../../domain/errors.js"
import type { ClientOrderId, OrderId, TickerSymbol } from "../../../domain/primitives.js"
import { AccountFromWire } from "../../../domain/schemas/account.js"
import { AssetFromWire } from "../../../domain/schemas/asset.js"
import { ClockFromWire } from "../../../domain/schemas/clock.js"
import {
  CancelAllFromWire,
  OrderFromWire,
  type CreateOrderRequest,
  type ReplaceOrderRequest,
} from "../../../domain/schemas/order.js"
import { AlpacaClient, type ListOrdersParams } from "../../../ports/broker.js"
import { dataMessageOf, isBusinessError, mapSdkError, statusOf, type MappedAlpacaError } from "./errors-map.js"

// The only SDK surface we consume; responses are re-decoded through our own
// schemas, so the SDK's loose types stop here.
interface AlpacaSdk {
  getAccount(): Promise<unknown>
  getClock(): Promise<unknown>
  createOrder(body: Record<string, unknown>): Promise<unknown>
  getOrder(id: string): Promise<unknown>
  getOrders(params: Record<string, unknown>): Promise<unknown>
  getOrderByClientId(clientOrderId: string): Promise<unknown>
  replaceOrder(id: string, body: Record<string, unknown>): Promise<unknown>
  cancelOrder(id: string): Promise<unknown>
  cancelAllOrders(): Promise<unknown>
  getAsset(symbol: string): Promise<unknown>
}
type AlpacaCtor = new (config: {
  keyId: string
  secretKey: string
  paper: boolean
  feed: string
}) => AlpacaSdk

// CJS/ESM interop: under Node ESM the class arrives on the namespace default.
const Alpaca: AlpacaCtor =
  (AlpacaModule as unknown as { default?: AlpacaCtor }).default ??
  (AlpacaModule as unknown as AlpacaCtor)

// Retryable transport errors only; business 4xx and contract drift never retry.
// 3 attempts max keeps us inside Alpaca's ~200 req/min budget.
const retrySchedule = Schedule.exponential("200 millis", 2).pipe(
  Schedule.intersect(Schedule.recurs(3)),
  Schedule.jittered
)

const isRetryableTag = (e: { readonly _tag: string }): boolean =>
  isRetryableAlpacaError(e as AlpacaError)

// On 429, wait at least Retry-After before the schedule's backoff resumes.
const pauseForRetryAfter = (e: { readonly _tag: string }) =>
  e._tag === "AlpacaRateLimited" && (e as { retryAfterSeconds?: number }).retryAfterSeconds !== undefined
    ? Effect.sleep(Duration.seconds((e as { retryAfterSeconds?: number }).retryAfterSeconds!))
    : Effect.void

const decodeStage = <A, I, R>(op: string, schema: Schema.Schema<A, I, R>) =>
  (raw: unknown) =>
    Schema.decodeUnknown(schema)(raw).pipe(
      Effect.mapError(
        (parseError) =>
          new AlpacaContractError({
            message: `Alpaca response for ${op} did not match the expected contract`,
            op,
            parseError: ParseResult.TreeFormatter.formatErrorSync(parseError),
          })
      )
    )

const timeoutStage = (op: string) =>
  Effect.timeoutFail({
    duration: "10 seconds",
    onTimeout: () => new AlpacaTimeout({ message: `Alpaca call ${op} timed out`, op }),
  })

// Read/idempotent recipe: tryPromise → decode → timeout → retry → span.
// `refine` maps a thrown SDK error to a precise domain error before the
// generic table (e.g. 404 → OrderNotFound). Business errors on these paths
// are contract violations → defects.
export const alpacaCall = <A, I, R, E2 extends { readonly _tag: string } = never>(
  op: string,
  thunk: () => Promise<unknown>,
  schema: Schema.Schema<A, I, R>,
  refine?: (thrown: unknown) => E2 | undefined
): Effect.Effect<A, AlpacaError | E2, R> =>
  Effect.tryPromise({
    try: thunk,
    catch: (thrown): MappedAlpacaError | E2 => refine?.(thrown) ?? mapSdkError(op)(thrown),
  }).pipe(
    Effect.flatMap(decodeStage(op, schema)),
    timeoutStage(op),
    Effect.tapError(pauseForRetryAfter),
    Effect.retry({ schedule: retrySchedule, while: isRetryableTag }),
    Effect.catchIf(
      (e) => isBusinessError(e as MappedAlpacaError),
      (e) => Effect.die(e)
    ),
    Effect.withSpan(`alpaca.${op}`)
  ) as Effect.Effect<A, AlpacaError | E2, R>

// Mutation recipe for createOrder: NO retry stage — after a timeout or
// network failure the order may have reached Alpaca, so a blind retry could
// double-submit. Business errors are legitimate typed failures here.
export const alpacaMutationCall = <A, I, R, E2 extends { readonly _tag: string } = never>(
  op: string,
  thunk: () => Promise<unknown>,
  schema: Schema.Schema<A, I, R>,
  refine?: (thrown: unknown) => E2 | undefined
): Effect.Effect<A, MappedAlpacaError | E2, R> =>
  Effect.tryPromise({
    try: thunk,
    catch: (thrown): MappedAlpacaError | E2 => refine?.(thrown) ?? mapSdkError(op)(thrown),
  }).pipe(
    Effect.flatMap(decodeStage(op, schema)),
    timeoutStage(op),
    Effect.withSpan(`alpaca.${op}`)
  )

// 404 → Option.none for lookup methods.
class WireNotFound extends Data.TaggedError("WireNotFound")<{}> {}

const alpacaOptionalCall = <A, I, R>(
  op: string,
  thunk: () => Promise<unknown>,
  schema: Schema.Schema<A, I, R>
): Effect.Effect<Option.Option<A>, AlpacaError, R> =>
  alpacaCall(op, thunk, schema, (thrown) =>
    statusOf(thrown) === 404 ? new WireNotFound() : undefined
  ).pipe(
    Effect.map(Option.some),
    Effect.catchTag("WireNotFound", () => Effect.succeed(Option.none()))
  )

const toWireOrder = (p: CreateOrderRequest): Record<string, unknown> => ({
  symbol: p.symbol,
  side: p.side,
  type: p.type,
  time_in_force: p.timeInForce,
  client_order_id: p.clientOrderId,
  ...("qty" in p ? { qty: p.qty } : { notional: p.notional }),
  ...(p.extendedHours !== undefined ? { extended_hours: p.extendedHours } : {}),
  ...(p.limitPrice !== undefined ? { limit_price: p.limitPrice } : {}),
  ...(p.stopPrice !== undefined ? { stop_price: p.stopPrice } : {}),
})

const isDuplicateClientOrderId = (thrown: unknown): boolean =>
  statusOf(thrown) === 422 && /client.?order.?id/i.test(dataMessageOf(thrown) ?? "")

export const AlpacaClientLive = Layer.effect(
  AlpacaClient,
  Effect.gen(function* () {
    const config = yield* AppConfig
    const sdk = new Alpaca({
      keyId: Redacted.value(config.alpacaKeyId),
      secretKey: Redacted.value(config.alpacaSecretKey),
      paper: config.tradingMode === "paper",
      feed: config.feed,
    })

    return {
      getAccount: () => alpacaCall("getAccount", () => sdk.getAccount(), AccountFromWire),
      getClock: () => alpacaCall("getClock", () => sdk.getClock(), ClockFromWire),

      createOrder: (params: CreateOrderRequest) =>
        alpacaMutationCall(
          "createOrder",
          () => sdk.createOrder(toWireOrder(params)),
          OrderFromWire,
          (thrown) =>
            isDuplicateClientOrderId(thrown)
              ? new DuplicateClientOrderId({
                  message: `clientOrderId ${params.clientOrderId} already exists`,
                })
              : undefined
        ),

      getOrder: (id: OrderId) =>
        alpacaCall("getOrder", () => sdk.getOrder(id), OrderFromWire, (thrown) =>
          statusOf(thrown) === 404
            ? new OrderNotFound({ message: `order ${id} not found` })
            : undefined
        ),

      getOrders: (params: ListOrdersParams) =>
        alpacaCall(
          "getOrders",
          () =>
            sdk.getOrders({
              status: params.status,
              limit: params.limit,
              direction: params.direction,
              ...(params.after !== undefined ? { after: params.after } : {}),
              ...(params.until !== undefined ? { until: params.until } : {}),
              ...(params.symbols !== undefined && params.symbols.length > 0
                ? { symbols: params.symbols.join(",") }
                : {}),
            }),
          Schema.Array(OrderFromWire)
        ),

      // Mutation: same no-retry stance as createOrder. 404/422 refined; a
      // replace of a non-replaceable order reuses OrderNotCancelable (409).
      replaceOrder: (id: OrderId, params: ReplaceOrderRequest) =>
        alpacaMutationCall(
          "replaceOrder",
          () =>
            sdk.replaceOrder(id, {
              ...(params.qty !== undefined ? { qty: params.qty } : {}),
              ...(params.timeInForce !== undefined ? { time_in_force: params.timeInForce } : {}),
              ...(params.limitPrice !== undefined ? { limit_price: params.limitPrice } : {}),
              ...(params.stopPrice !== undefined ? { stop_price: params.stopPrice } : {}),
              ...(params.clientOrderId !== undefined
                ? { client_order_id: params.clientOrderId }
                : {}),
            }),
          OrderFromWire,
          (thrown) => {
            const status = statusOf(thrown)
            if (status === 404) return new OrderNotFound({ message: `order ${id} not found` })
            if (status === 422 && !/buying power|pattern day trad/i.test(dataMessageOf(thrown) ?? ""))
              return new OrderNotCancelable({
                message: dataMessageOf(thrown) ?? `order ${id} cannot be replaced`,
              })
            return undefined
          }
        ),

      getOrderByClientOrderId: (id: ClientOrderId) =>
        alpacaOptionalCall("getOrderByClientOrderId", () => sdk.getOrderByClientId(id), OrderFromWire),

      // Idempotent by orderId, so the retrying recipe is safe here.
      cancelOrder: (id: OrderId) =>
        alpacaCall("cancelOrder", () => sdk.cancelOrder(id), Schema.Unknown, (thrown) => {
          const status = statusOf(thrown)
          if (status === 404) return new OrderNotFound({ message: `order ${id} not found` })
          if (status === 422)
            return new OrderNotCancelable({
              message: dataMessageOf(thrown) ?? `order ${id} is not cancelable`,
            })
          return undefined
        }).pipe(Effect.asVoid),

      cancelAllOrders: () =>
        alpacaCall("cancelAllOrders", () => sdk.cancelAllOrders(), CancelAllFromWire),

      getAsset: (symbol: TickerSymbol) =>
        alpacaOptionalCall("getAsset", () => sdk.getAsset(symbol), AssetFromWire),
    }
  })
)
