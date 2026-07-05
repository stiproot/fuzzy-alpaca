import { Cache, Effect, Option } from "effect"
import {
  AlpacaUnavailable,
  AssetNotFound,
  AssetNotTradable,
  ConfirmationRequired,
  MaxOrderSizeExceeded,
  OrderNotCancelable,
  ValidationError,
  type AlpacaError,
  type InsufficientBuyingPower,
  type OrderNotFound,
  type PdtRuleViolation,
} from "../../domain/errors.js"
import type { OrderId, TickerSymbol, TradingMode } from "../../domain/primitives.js"
import type { CreateOrderRequest, Order, OrderResponse } from "../../domain/schemas/order.js"
import { AppConfig } from "../../config.js"
import { AlpacaClient } from "../../ports/broker.js"

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

    return {
      getAccount: () => broker.getAccount(),
      getClock: () => broker.getClock(),
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
