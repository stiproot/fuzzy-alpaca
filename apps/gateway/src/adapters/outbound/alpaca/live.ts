import AlpacaModule from "@alpacahq/alpaca-trade-api"
import { HttpClient, HttpClientRequest } from "@effect/platform"
import { Data, Duration, Effect, Layer, Option, ParseResult, Redacted, Schedule, Schema } from "effect"
import { AppConfig } from "../../../config.js"
import {
  AlpacaContractError,
  AlpacaTimeout,
  AlpacaUnavailable,
  AssetNotFound,
  DuplicateClientOrderId,
  OrderNotCancelable,
  OrderNotFound,
  PositionNotFound,
  isRetryableAlpacaError,
  type AlpacaError,
} from "../../../domain/errors.js"
import {
  cryptoSymbolFromSlashless,
  isCryptoSymbol,
  type AnySymbol,
  type ClientOrderId,
  type OrderId,
} from "../../../domain/primitives.js"
import { AccountFromWire } from "../../../domain/schemas/account.js"
import { AssetFromWire } from "../../../domain/schemas/asset.js"
import { ClockFromWire } from "../../../domain/schemas/clock.js"
import {
  CancelAllFromWire,
  OrderFromWire,
  type CreateOrderRequest,
  type ReplaceOrderRequest,
} from "../../../domain/schemas/order.js"
import { CalendarDay } from "../../../domain/schemas/calendar.js"
import {
  BarsPageFromWire,
  CryptoBarsPageFromWire,
  LatestQuoteFromWire,
  LatestTradeFromWire,
  QuoteDataFromWire,
  SnapshotFromWire,
  TradeDataFromWire,
  type BarsPage,
  type Snapshot,
} from "../../../domain/schemas/market-data.js"
import { PositionFromWire, type Position } from "../../../domain/schemas/position.js"
import {
  AlpacaClient,
  type CalendarParams,
  type ClosePositionParams,
  type GetBarsParams,
  type ListAssetsParams,
  type ListOrdersParams,
} from "../../../ports/broker.js"
import { dataMessageOf, isBusinessError, mapSdkError, statusOf, type MappedAlpacaError } from "./errors-map.js"
import { instrument } from "./metrics.js"

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
  getPositions(): Promise<unknown>
  getPosition(symbol: string): Promise<unknown>
  getAssets(params: Record<string, unknown>): Promise<unknown>
  getCalendar(params: Record<string, unknown>): Promise<unknown>
  // closePosition() in the SDK cannot pass qty/percentage, so partial closes
  // go through the SDK's public raw-request escape hatch.
  sendRequest(endpoint: string, queryParams: unknown, body: unknown, method: string): Promise<unknown>
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

// Read/idempotent pipeline over any raw-JSON source (SDK promise or direct
// REST): decode → timeout → retry → metrics → span. Business errors on read
// paths are contract violations → defects.
const alpacaReadPipeline = <A, I, R, E2 extends { readonly _tag: string }, R2>(
  op: string,
  source: Effect.Effect<unknown, MappedAlpacaError | E2, R2>,
  schema: Schema.Schema<A, I, R>
): Effect.Effect<A, AlpacaError | E2, R | R2> =>
  source.pipe(
    Effect.flatMap(decodeStage(op, schema)),
    timeoutStage(op),
    Effect.tapError(pauseForRetryAfter),
    Effect.retry({ schedule: retrySchedule, while: isRetryableTag }),
    Effect.catchIf(
      (e) => isBusinessError(e as MappedAlpacaError),
      (e) => Effect.die(e)
    ),
    instrument(op),
    Effect.withSpan(`alpaca.${op}`)
  ) as Effect.Effect<A, AlpacaError | E2, R | R2>

// `refine` maps a thrown SDK error to a precise domain error before the
// generic table (e.g. 404 → OrderNotFound).
export const alpacaCall = <A, I, R, E2 extends { readonly _tag: string } = never>(
  op: string,
  thunk: () => Promise<unknown>,
  schema: Schema.Schema<A, I, R>,
  refine?: (thrown: unknown) => E2 | undefined
): Effect.Effect<A, AlpacaError | E2, R> =>
  alpacaReadPipeline(
    op,
    Effect.tryPromise({
      try: thunk,
      catch: (thrown): MappedAlpacaError | E2 => refine?.(thrown) ?? mapSdkError(op)(thrown),
    }),
    schema
  )

// Mutation recipe for createOrder/replaceOrder/closePosition: NO retry stage —
// after a timeout or network failure the mutation may have reached Alpaca, so
// a blind retry could double-submit. Business errors are legitimate typed
// failures here.
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
    instrument(op),
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

const DATA_BASE_URL = "https://data.alpaca.markets/v2/stocks"
const CRYPTO_DATA_BASE_URL = "https://data.alpaca.markets/v1beta3/crypto/us"

// Trading-API path segments can't carry "/": USD pairs use the legacy
// slashless form (per Alpaca docs), other quotes the URL-encoded slash.
const assetPathForm = (symbol: AnySymbol): string =>
  isCryptoSymbol(symbol)
    ? symbol.endsWith("/USD")
      ? symbol.replace("/", "")
      : encodeURIComponent(symbol)
    : symbol

// Positions use the slashless legacy form in paths.
const positionPathForm = (symbol: AnySymbol): string =>
  isCryptoSymbol(symbol) ? symbol.replace("/", "") : symbol

// Position wire symbols are slashless ("BTCUSD"); normalize crypto positions
// to the canonical pair form.
const normalizePositionSymbol = (position: Position): Position =>
  position.assetClass === "crypto"
    ? {
        ...position,
        symbol: (cryptoSymbolFromSlashless(position.symbol) ?? position.symbol) as AnySymbol,
      }
    : position

// Crypto data responses nest per requested symbol; a well-formed but unknown
// symbol is silently omitted from the map — surface that as AssetNotFound.
export const unwrapCryptoEntry =
  (kind: string, symbol: string) =>
  (raw: unknown): Effect.Effect<unknown, AssetNotFound> => {
    const map = (raw as Record<string, unknown> | null)?.[kind]
    const entry =
      typeof map === "object" && map !== null
        ? (map as Record<string, unknown>)[symbol]
        : undefined
    return entry === undefined
      ? Effect.fail(new AssetNotFound({ message: `no crypto ${kind} data for ${symbol}` }))
      : Effect.succeed(entry)
  }

export const AlpacaClientLive = Layer.effect(
  AlpacaClient,
  Effect.gen(function* () {
    const config = yield* AppConfig
    const http = yield* HttpClient.HttpClient
    const sdk = new Alpaca({
      keyId: Redacted.value(config.alpacaKeyId),
      secretKey: Redacted.value(config.alpacaSecretKey),
      paper: config.tradingMode === "paper",
      feed: config.feed,
    })

    // Direct REST against the data API: the SDK's bars iterator swallows
    // next_page_token, and its entity remapping is undocumented — raw wire
    // shapes + our schemas are the stabler contract. Same pipeline as SDK
    // calls; unknown symbols become AssetNotFound.
    const restGetRaw = (
      op: string,
      url: string,
      params: Record<string, string | number | undefined>
    ): Effect.Effect<unknown, MappedAlpacaError | AssetNotFound> =>
      Effect.scoped(
        Effect.gen(function* () {
          const request = HttpClientRequest.get(url).pipe(
            HttpClientRequest.setHeaders({
              "APCA-API-KEY-ID": Redacted.value(config.alpacaKeyId),
              "APCA-API-SECRET-KEY": Redacted.value(config.alpacaSecretKey),
            }),
            HttpClientRequest.setUrlParams(
              Object.fromEntries(
                Object.entries(params)
                  .filter(([, value]) => value !== undefined)
                  .map(([key, value]) => [key, String(value)])
              )
            )
          )
          const response = yield* http.execute(request).pipe(
            Effect.mapError(
              (error) =>
                new AlpacaUnavailable({ message: `Alpaca unreachable during ${op}: ${error.message}` })
            )
          )
          if (response.status === 404) {
            return yield* Effect.fail(
              new AssetNotFound({ message: `no data for symbol (${op}): not found at Alpaca` })
            )
          }
          if (response.status >= 400) {
            const data = yield* response.json.pipe(Effect.orElseSucceed(() => ({})))
            return yield* Effect.fail(
              mapSdkError(op)({
                response: {
                  status: response.status,
                  data,
                  headers: { "retry-after": response.headers["retry-after"] },
                },
              })
            )
          }
          return yield* response.json.pipe(
            Effect.mapError(
              () => new AlpacaUnavailable({ message: `Alpaca returned unparseable JSON during ${op}` })
            )
          )
        })
      )

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

      getAsset: (symbol: AnySymbol) =>
        alpacaOptionalCall("getAsset", () => sdk.getAsset(assetPathForm(symbol)), AssetFromWire),

      getPositions: () =>
        alpacaCall("getPositions", () => sdk.getPositions(), Schema.Array(PositionFromWire)).pipe(
          Effect.map((positions) => positions.map(normalizePositionSymbol))
        ),

      getLatestQuote: (symbol: AnySymbol) =>
        isCryptoSymbol(symbol)
          ? alpacaReadPipeline(
              "getLatestQuote",
              restGetRaw("getLatestQuote", `${CRYPTO_DATA_BASE_URL}/latest/quotes`, {
                symbols: symbol,
              }).pipe(Effect.flatMap(unwrapCryptoEntry("quotes", symbol))),
              QuoteDataFromWire
            ).pipe(Effect.map((quote) => ({ symbol, ...quote })))
          : alpacaReadPipeline(
              "getLatestQuote",
              restGetRaw("getLatestQuote", `${DATA_BASE_URL}/${symbol}/quotes/latest`, {
                feed: config.feed,
              }),
              LatestQuoteFromWire
            ).pipe(Effect.map((wire) => ({ symbol: wire.symbol, ...wire.quote }))),

      getLatestTrade: (symbol: AnySymbol) =>
        isCryptoSymbol(symbol)
          ? alpacaReadPipeline(
              "getLatestTrade",
              restGetRaw("getLatestTrade", `${CRYPTO_DATA_BASE_URL}/latest/trades`, {
                symbols: symbol,
              }).pipe(Effect.flatMap(unwrapCryptoEntry("trades", symbol))),
              TradeDataFromWire
            ).pipe(Effect.map((trade) => ({ symbol, ...trade })))
          : alpacaReadPipeline(
              "getLatestTrade",
              restGetRaw("getLatestTrade", `${DATA_BASE_URL}/${symbol}/trades/latest`, {
                feed: config.feed,
              }),
              LatestTradeFromWire
            ).pipe(Effect.map((wire) => ({ symbol: wire.symbol, ...wire.trade }))),

      getSnapshot: (symbol: AnySymbol): Effect.Effect<Snapshot, AlpacaError | AssetNotFound> =>
        isCryptoSymbol(symbol)
          ? alpacaReadPipeline(
              "getSnapshot",
              restGetRaw("getSnapshot", `${CRYPTO_DATA_BASE_URL}/snapshots`, {
                symbols: symbol,
              }).pipe(
                Effect.flatMap(unwrapCryptoEntry("snapshots", symbol)),
                // crypto snapshot entries carry no symbol field; inject ours
                Effect.map((entry) =>
                  typeof entry === "object" && entry !== null ? { ...entry, symbol } : entry
                )
              ),
              SnapshotFromWire
            )
          : alpacaReadPipeline(
              "getSnapshot",
              restGetRaw("getSnapshot", `${DATA_BASE_URL}/${symbol}/snapshot`, { feed: config.feed }),
              SnapshotFromWire
            ),

      getBars: (symbol: AnySymbol, params: GetBarsParams): Effect.Effect<BarsPage, AlpacaError | AssetNotFound> =>
        isCryptoSymbol(symbol)
          ? alpacaReadPipeline(
              "getBars",
              restGetRaw("getBars", `${CRYPTO_DATA_BASE_URL}/bars`, {
                symbols: symbol,
                timeframe: params.timeframe,
                start: params.start,
                end: params.end,
                limit: params.limit,
                page_token: params.pageToken,
              }),
              CryptoBarsPageFromWire
            ).pipe(
              Effect.map((wire) => ({
                symbol,
                items: wire.bars[symbol] ?? [],
                ...(Option.isSome(wire.nextPageToken)
                  ? { nextPageToken: wire.nextPageToken.value }
                  : {}),
              }))
            )
          : alpacaReadPipeline(
              "getBars",
              restGetRaw("getBars", `${DATA_BASE_URL}/${symbol}/bars`, {
                timeframe: params.timeframe,
                start: params.start,
                end: params.end,
                limit: params.limit,
                adjustment: params.adjustment,
                page_token: params.pageToken,
                feed: config.feed,
              }),
              BarsPageFromWire
            ).pipe(
              Effect.map((wire) => ({
                symbol: wire.symbol,
                items: Option.getOrElse(wire.bars, () => []),
                ...(Option.isSome(wire.nextPageToken)
                  ? { nextPageToken: wire.nextPageToken.value }
                  : {}),
              }))
            ),

      getAssets: (params: ListAssetsParams) =>
        alpacaCall(
          "getAssets",
          () => sdk.getAssets({ status: params.status ?? "active" }),
          Schema.Array(AssetFromWire)
        ),

      getCalendar: (params: CalendarParams) =>
        alpacaCall(
          "getCalendar",
          () =>
            sdk.getCalendar({
              ...(params.start !== undefined ? { start: params.start } : {}),
              ...(params.end !== undefined ? { end: params.end } : {}),
            }),
          Schema.Array(CalendarDay)
        ),

      getPosition: (symbol: AnySymbol) =>
        alpacaOptionalCall(
          "getPosition",
          () => sdk.getPosition(positionPathForm(symbol)),
          PositionFromWire
        ).pipe(Effect.map(Option.map(normalizePositionSymbol))),

      // Returns the liquidation order Alpaca creates for the close.
      closePosition: (symbol: AnySymbol, params: ClosePositionParams) =>
        alpacaMutationCall(
          "closePosition",
          () =>
            sdk.sendRequest(
              `/positions/${positionPathForm(symbol)}`,
              {
                ...(params.qty !== undefined ? { qty: params.qty } : {}),
                ...(params.percentage !== undefined ? { percentage: params.percentage } : {}),
              },
              null,
              "DELETE"
            ),
          OrderFromWire,
          (thrown) =>
            statusOf(thrown) === 404
              ? new PositionNotFound({ message: `no open position in ${symbol}` })
              : undefined
        ),
    }
  })
)
