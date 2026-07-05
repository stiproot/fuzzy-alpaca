import { Cache, DateTime, Effect, Option, Schema } from "effect"
import {
  AlpacaUnavailable,
  AssetNotFound,
  AssetNotTradable,
  ConfirmationRequired,
  MaxOrderSizeExceeded,
  OrderNotCancelable,
  OrderNotFound,
  ValidationError,
  type AlpacaError,
  type InsufficientBuyingPower,
  type PdtRuleViolation,
  type PositionNotFound,
} from "../../domain/errors.js"
import { ClientOrderId, OrderId, type TickerSymbol, type TradingMode } from "../../domain/primitives.js"
import type {
  CreateOrderRequest,
  ListOrdersQuery,
  Order,
  OrderPage,
  OrderResponse,
  ReplaceOrderRequest,
} from "../../domain/schemas/order.js"
import type { ClosePositionQuery, Position } from "../../domain/schemas/position.js"
import { AppConfig } from "../../config.js"
import {
  AlpacaClient,
  type ClosePositionParams,
  type ListOrdersParams,
} from "../../ports/broker.js"
import { decodeOrdersPageToken, encodeOrdersPageToken } from "./page-token.js"

export type PlaceOrderError =
  | AlpacaError
  | MaxOrderSizeExceeded
  | AssetNotFound
  | AssetNotTradable
  | InsufficientBuyingPower
  | PdtRuleViolation

// Order states in which a cancel request is already moot — a repeated cancel
// returns the current state instead of erroring.
const alreadyFinishedCanceling: ReadonlyArray<Order["status"]> = [
  "canceled",
  "pending_cancel",
  "expired",
  "done_for_day",
]

export class TradingService extends Effect.Service<TradingService>()("TradingService", {
  effect: Effect.gen(function* () {
    const broker = yield* AlpacaClient
    const config = yield* AppConfig

    // Tradability pre-check cache: assets change rarely; 5 minutes keeps the
    // hot path off Alpaca without letting halted/delisted symbols linger.
    const assetCache = yield* Cache.make({
      capacity: 1024,
      timeToLive: "5 minutes",
      lookup: (symbol: TickerSymbol) => broker.getAsset(symbol),
    })

    const audit = (action: string, fields: Record<string, unknown>) =>
      Effect.logInfo("order.audit").pipe(
        Effect.annotateLogs({ action, tradingMode: config.tradingMode, ...fields })
      )

    const withMeta = (order: Order, idempotentReplay: boolean): OrderResponse => ({
      ...order,
      tradingMode: config.tradingMode as TradingMode,
      idempotentReplay,
    })

    const checkRails = (req: CreateOrderRequest) => {
      if ("qty" in req && Option.isSome(config.maxOrderQty) && Number(req.qty) > config.maxOrderQty.value) {
        return Effect.fail(
          new MaxOrderSizeExceeded({
            message: `qty ${req.qty} exceeds MAX_ORDER_QTY=${config.maxOrderQty.value}`,
          })
        )
      }
      if (
        "notional" in req &&
        Option.isSome(config.maxOrderNotional) &&
        Number(req.notional) > config.maxOrderNotional.value
      ) {
        return Effect.fail(
          new MaxOrderSizeExceeded({
            message: `notional ${req.notional} exceeds MAX_ORDER_NOTIONAL=${config.maxOrderNotional.value}`,
          })
        )
      }
      return Effect.void
    }

    const checkTradable = (
      symbol: TickerSymbol
    ): Effect.Effect<void, AlpacaError | AssetNotFound | AssetNotTradable> =>
      assetCache.get(symbol).pipe(
        Effect.flatMap(
          Option.match({
            onNone: (): Effect.Effect<void, AssetNotFound | AssetNotTradable> =>
              Effect.fail(new AssetNotFound({ message: `asset ${symbol} not found` })),
            onSome: (asset): Effect.Effect<void, AssetNotFound | AssetNotTradable> =>
              asset.tradable
                ? Effect.void
                : Effect.fail(new AssetNotTradable({ message: `asset ${symbol} is not tradable` })),
          })
        )
      )

    // The submission outcome is unknown (timeout / network failure after the
    // request may have reached Alpaca). NEVER resubmit server-side: look the
    // order up by its idempotency key; found → replay, not found → tell the
    // agent to retry with the SAME clientOrderId.
    const reconcile = (req: CreateOrderRequest, causeTag: string) =>
      broker.getOrderByClientOrderId(req.clientOrderId).pipe(
        Effect.mapError(
          () =>
            new AlpacaUnavailable({
              message: `order submission outcome unknown (${causeTag}) and reconciliation lookup failed — retry with the same clientOrderId ${req.clientOrderId}`,
            })
        ),
        Effect.flatMap(
          Option.match({
            onSome: (order) =>
              audit("createOrder.reconciled", {
                clientOrderId: req.clientOrderId,
                orderId: order.orderId,
              }).pipe(Effect.as(withMeta(order, true))),
            onNone: () =>
              Effect.fail(
                new AlpacaUnavailable({
                  message: `order submission outcome unknown (${causeTag}); no order found for clientOrderId ${req.clientOrderId} — retry with the same clientOrderId`,
                })
              ),
          })
        )
      )

    const placeOrder = (req: CreateOrderRequest): Effect.Effect<OrderResponse, PlaceOrderError> =>
      checkRails(req).pipe(
        Effect.andThen(checkTradable(req.symbol)),
        Effect.andThen(
          broker.createOrder(req).pipe(
            Effect.map((order) => withMeta(order, false)),
            Effect.catchTags({
              // Alpaca already has this clientOrderId → idempotent replay
              DuplicateClientOrderId: () =>
                broker.getOrderByClientOrderId(req.clientOrderId).pipe(
                  Effect.flatMap(
                    Option.match({
                      onSome: (order) => Effect.succeed(withMeta(order, true)),
                      onNone: () =>
                        Effect.fail(
                          new ValidationError({
                            message: `Alpaca reported clientOrderId ${req.clientOrderId} as duplicate but no such order exists`,
                          })
                        ),
                    })
                  )
                ),
              AlpacaTimeout: (e) => reconcile(req, e._tag),
              AlpacaUnavailable: (e) => reconcile(req, e._tag),
            })
          )
        ),
        Effect.tap((response) =>
          audit("createOrder", {
            clientOrderId: req.clientOrderId,
            symbol: req.symbol,
            side: req.side,
            type: req.type,
            outcome: response.orderId,
            idempotentReplay: response.idempotentReplay,
          })
        ),
        Effect.tapError((error) =>
          audit("createOrder.failed", {
            clientOrderId: req.clientOrderId,
            symbol: req.symbol,
            outcome: error._tag,
          })
        ),
        Effect.withSpan("trading.placeOrder")
      )

    const cancelOrder = (
      orderId: OrderId
    ): Effect.Effect<OrderResponse, AlpacaError | OrderNotFound | OrderNotCancelable> =>
      broker.cancelOrder(orderId).pipe(
        Effect.andThen(broker.getOrder(orderId)),
        Effect.catchTag("OrderNotCancelable", (error) =>
          // Cancel-of-canceled is not an error: return the current state.
          broker.getOrder(orderId).pipe(
            Effect.filterOrFail(
              (order) => alreadyFinishedCanceling.includes(order.status),
              () => error
            )
          )
        ),
        Effect.map((order) => withMeta(order, false)),
        Effect.tap((response) =>
          audit("cancelOrder", { orderId, outcome: response.status })
        ),
        Effect.tapError((error) => audit("cancelOrder.failed", { orderId, outcome: error._tag })),
        Effect.withSpan("trading.cancelOrder")
      )

    const cancelAllOrders = (
      confirm: boolean
    ): Effect.Effect<
      { results: ReadonlyArray<{ readonly orderId: string; readonly status: number }> },
      ConfirmationRequired | AlpacaError
    > =>
      confirm
        ? broker.cancelAllOrders().pipe(
            Effect.map((results) => ({ results })),
            Effect.tap((r) => audit("cancelAllOrders", { outcome: `${r.results.length} orders` })),
            Effect.withSpan("trading.cancelAllOrders")
          )
        : Effect.fail(
            new ConfirmationRequired({
              message: "cancel-all requires ?confirm=true — it liquidates every open order",
            })
          )

    // Uniform cursor pagination synthesized over Alpaca's after/until bounds:
    // the token carries the boundary createdAt of the previous page's last
    // item. `side` has no Alpaca-side filter, so it is applied post-fetch —
    // a filtered page may hold fewer than `limit` items.
    const listOrders = (
      query: ListOrdersQuery
    ): Effect.Effect<OrderPage, AlpacaError | ValidationError> =>
      Effect.gen(function* () {
        const direction = query.direction ?? "desc"
        const limit = query.limit ?? 100
        const cursor =
          query.pageToken !== undefined
            ? yield* decodeOrdersPageToken(query.pageToken).pipe(
                Effect.filterOrFail(
                  (c) => c.direction === direction,
                  () =>
                    new ValidationError({
                      message: "pageToken direction does not match the requested direction",
                    })
                )
              )
            : undefined

        const params: ListOrdersParams = {
          status: query.status ?? "open",
          limit,
          direction,
          symbols: query.symbols?.split(",").map((s) => s.trim().toUpperCase()),
          // the cursor boundary supersedes the caller's own bound on that side
          after: direction === "asc" ? (cursor?.boundary ?? query.after) : query.after,
          until: direction === "desc" ? (cursor?.boundary ?? query.until) : query.until,
        }

        const fetched = yield* broker.getOrders(params)
        const items =
          query.side === undefined ? fetched : fetched.filter((o) => o.side === query.side)
        const last = fetched[fetched.length - 1]
        return {
          items,
          ...(fetched.length === limit && last !== undefined
            ? {
                nextPageToken: encodeOrdersPageToken({
                  boundary: DateTime.formatIso(last.createdAt),
                  direction,
                }),
              }
            : {}),
        }
      }).pipe(Effect.withSpan("trading.listOrders"))

    const getOrderFlexible = (
      rawId: string,
      byClientOrderId: boolean
    ): Effect.Effect<OrderResponse, AlpacaError | OrderNotFound | ValidationError> =>
      byClientOrderId
        ? Schema.decodeUnknown(ClientOrderId)(rawId).pipe(
            Effect.mapError(() => new ValidationError({ message: `invalid clientOrderId: ${rawId}` })),
            Effect.flatMap((cid) => broker.getOrderByClientOrderId(cid)),
            Effect.flatMap(
              Option.match({
                onNone: () =>
                  Effect.fail(
                    new OrderNotFound({ message: `no order with clientOrderId ${rawId}` })
                  ),
                onSome: Effect.succeed,
              })
            ),
            Effect.map((order) => withMeta(order, false))
          )
        : Schema.decodeUnknown(OrderId)(rawId).pipe(
            Effect.mapError(
              () => new ValidationError({ message: `orderId must be a UUID (got ${rawId}); pass byClientOrderId=true to look up by clientOrderId` })
            ),
            Effect.flatMap((id) => broker.getOrder(id)),
            Effect.map((order) => withMeta(order, false))
          )

    const replaceOrder = (
      orderId: OrderId,
      req: ReplaceOrderRequest
    ): Effect.Effect<
      OrderResponse,
      AlpacaError | OrderNotFound | OrderNotCancelable | InsufficientBuyingPower | PdtRuleViolation
    > =>
      broker.replaceOrder(orderId, req).pipe(
        Effect.map((order) => withMeta(order, false)),
        Effect.tap((response) =>
          audit("replaceOrder", {
            orderId,
            outcome: response.orderId,
            replaces: orderId,
          })
        ),
        Effect.tapError((error) => audit("replaceOrder.failed", { orderId, outcome: error._tag })),
        Effect.withSpan("trading.replaceOrder")
      )

    const isPositiveDecimal = (s: string) => /^\d+(\.\d+)?$/.test(s) && Number(s) > 0

    const closePosition = (
      symbol: TickerSymbol,
      query: ClosePositionQuery
    ): Effect.Effect<
      OrderResponse,
      | AlpacaError
      | PositionNotFound
      | InsufficientBuyingPower
      | PdtRuleViolation
    > =>
      Effect.gen(function* () {
        if (query.qty !== undefined && query.percentage !== undefined) {
          return yield* Effect.fail(
            new ValidationError({ message: "qty and percentage are mutually exclusive" })
          )
        }
        if (query.qty !== undefined && !isPositiveDecimal(query.qty)) {
          return yield* Effect.fail(
            new ValidationError({ message: `qty must be a positive decimal (got ${query.qty})` })
          )
        }
        if (
          query.percentage !== undefined &&
          (!isPositiveDecimal(query.percentage) || Number(query.percentage) > 100)
        ) {
          return yield* Effect.fail(
            new ValidationError({ message: `percentage must be in (0, 100] (got ${query.percentage})` })
          )
        }
        const params: ClosePositionParams = { qty: query.qty, percentage: query.percentage }
        const liquidation = yield* broker.closePosition(symbol, params)
        return withMeta(liquidation, false)
      }).pipe(
        Effect.tap((response) =>
          audit("closePosition", {
            symbol,
            qty: query.qty ?? query.percentage ?? "full",
            outcome: response.orderId,
          })
        ),
        Effect.tapError((error) =>
          audit("closePosition.failed", { symbol, outcome: error._tag })
        ),
        Effect.withSpan("trading.closePosition")
      )

    return {
      getAccount: () => broker.getAccount(),
      getClock: () => broker.getClock(),
      listOrders,
      getOrderFlexible,
      replaceOrder,
      listPositions: (): Effect.Effect<ReadonlyArray<Position>, AlpacaError> =>
        broker.getPositions(),
      getPosition: (symbol: TickerSymbol): Effect.Effect<Option.Option<Position>, AlpacaError> =>
        broker.getPosition(symbol),
      closePosition,
      // Fast health probe: 2s budget, never fails — degraded on any problem.
      connectivity: (): Effect.Effect<"ok" | "degraded"> =>
        broker.getClock().pipe(
          Effect.timeoutOption("2 seconds"),
          Effect.map((result) => (Option.isSome(result) ? ("ok" as const) : ("degraded" as const))),
          Effect.catchAll(() => Effect.succeed("degraded" as const))
        ),
      placeOrder,
      cancelOrder,
      cancelAllOrders,
    }
  }),
}) {}
