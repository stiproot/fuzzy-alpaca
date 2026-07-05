import { Schema } from "effect"
import {
  ClientOrderId,
  DecimalString,
  MoneyString,
  OrderId,
  OrderSide,
  OrderStatus,
  OrderType,
  PositiveDecimalString,
  TickerSymbol,
  TimeInForce,
  TradingMode,
} from "../primitives.js"

// Domain shape — also the HTTP contract. Absent values encode as null.
export const Order = Schema.Struct({
  orderId: OrderId,
  clientOrderId: ClientOrderId,
  symbol: TickerSymbol,
  side: OrderSide,
  type: OrderType,
  timeInForce: TimeInForce,
  status: OrderStatus,
  qty: Schema.OptionFromNullOr(DecimalString),
  notional: Schema.OptionFromNullOr(MoneyString),
  filledQty: DecimalString,
  filledAvgPrice: Schema.OptionFromNullOr(MoneyString),
  limitPrice: Schema.OptionFromNullOr(MoneyString),
  stopPrice: Schema.OptionFromNullOr(MoneyString),
  extendedHours: Schema.Boolean,
  createdAt: Schema.DateTimeUtc,
  submittedAt: Schema.OptionFromNullOr(Schema.DateTimeUtc),
  filledAt: Schema.OptionFromNullOr(Schema.DateTimeUtc),
  canceledAt: Schema.OptionFromNullOr(Schema.DateTimeUtc),
  expiredAt: Schema.OptionFromNullOr(Schema.DateTimeUtc),
  failedAt: Schema.OptionFromNullOr(Schema.DateTimeUtc),
  replacesOrderId: Schema.OptionFromNullOr(OrderId),
  replacedByOrderId: Schema.OptionFromNullOr(OrderId),
})
export type Order = typeof Order.Type

const fromWire = <A, I, R>(schema: Schema.Schema<A, I, R>, wireKey: string) =>
  Schema.propertySignature(schema).pipe(Schema.fromKey(wireKey))

// Alpaca v2 order wire shape. Fields Alpaca may omit entirely on some paths
// (vs return as null) use optionalWith default-null semantics where needed.
export const OrderFromWire = Schema.Struct({
  orderId: fromWire(OrderId, "id"),
  clientOrderId: fromWire(ClientOrderId, "client_order_id"),
  symbol: TickerSymbol,
  side: OrderSide,
  type: OrderType,
  timeInForce: fromWire(TimeInForce, "time_in_force"),
  status: OrderStatus,
  qty: fromWire(Schema.OptionFromNullOr(DecimalString), "qty"),
  notional: Schema.OptionFromNullOr(MoneyString),
  filledQty: fromWire(DecimalString, "filled_qty"),
  filledAvgPrice: fromWire(Schema.OptionFromNullOr(MoneyString), "filled_avg_price"),
  limitPrice: fromWire(Schema.OptionFromNullOr(MoneyString), "limit_price"),
  stopPrice: fromWire(Schema.OptionFromNullOr(MoneyString), "stop_price"),
  extendedHours: fromWire(Schema.Boolean, "extended_hours"),
  createdAt: fromWire(Schema.DateTimeUtc, "created_at"),
  submittedAt: fromWire(Schema.OptionFromNullOr(Schema.DateTimeUtc), "submitted_at"),
  filledAt: fromWire(Schema.OptionFromNullOr(Schema.DateTimeUtc), "filled_at"),
  canceledAt: fromWire(Schema.OptionFromNullOr(Schema.DateTimeUtc), "canceled_at"),
  expiredAt: fromWire(Schema.OptionFromNullOr(Schema.DateTimeUtc), "expired_at"),
  failedAt: fromWire(Schema.OptionFromNullOr(Schema.DateTimeUtc), "failed_at"),
  replacesOrderId: fromWire(Schema.OptionFromNullOr(OrderId), "replaces"),
  replacedByOrderId: fromWire(Schema.OptionFromNullOr(OrderId), "replaced_by"),
})

// ---- Requests ----

const createOrderBase = {
  symbol: TickerSymbol,
  side: OrderSide,
  type: OrderType,
  timeInForce: TimeInForce,
  // Required: the idempotency key. Duplicate market orders are the worst
  // failure mode, so the caller must always hold the key.
  clientOrderId: ClientOrderId,
  extendedHours: Schema.optional(Schema.Boolean),
  limitPrice: Schema.optional(PositiveDecimalString),
  stopPrice: Schema.optional(PositiveDecimalString),
}

export const CreateOrderRequest = Schema.Union(
  Schema.Struct({ ...createOrderBase, qty: PositiveDecimalString }),
  Schema.Struct({ ...createOrderBase, notional: PositiveDecimalString })
).pipe(
  Schema.filter((o) => {
    const needsLimit = o.type === "limit" || o.type === "stop_limit"
    const needsStop = o.type === "stop" || o.type === "stop_limit"
    if (needsLimit && o.limitPrice === undefined) return `limitPrice is required for type=${o.type}`
    if (!needsLimit && o.limitPrice !== undefined) return `limitPrice is not allowed for type=${o.type}`
    if (needsStop && o.stopPrice === undefined) return `stopPrice is required for type=${o.type}`
    if (!needsStop && o.stopPrice !== undefined) return `stopPrice is not allowed for type=${o.type}`
    if ("notional" in o && o.type !== "market") return "notional orders must have type=market"
    return true
  })
).annotations({ parseOptions: { onExcessProperty: "error" } })
export type CreateOrderRequest = typeof CreateOrderRequest.Type

// ---- Responses ----

export const OrderResponse = Schema.Struct({
  ...Order.fields,
  tradingMode: TradingMode,
  // true when this response replays an order that already existed for the
  // supplied clientOrderId (idempotent duplicate or post-ambiguity reconcile)
  idempotentReplay: Schema.Boolean,
})
export type OrderResponse = typeof OrderResponse.Type

export const CancelAllResult = Schema.Struct({
  orderId: Schema.String,
  status: Schema.Number,
})

export const CancelAllResponse = Schema.Struct({
  results: Schema.Array(CancelAllResult),
})
export type CancelAllResponse = typeof CancelAllResponse.Type

export const CancelAllFromWire = Schema.Array(
  Schema.Struct({
    orderId: fromWire(Schema.String, "id"),
    status: Schema.Number,
  })
)
