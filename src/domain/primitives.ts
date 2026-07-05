import { Schema } from "effect"

// Alpaca returns monetary quantities as JSON strings. They stay validated
// decimal strings end-to-end — never floats — so real money never drifts.
export const MoneyString = Schema.String.pipe(
  Schema.pattern(/^-?\d+(\.\d+)?$/),
  Schema.brand("Money")
)
export type MoneyString = typeof MoneyString.Type

// Non-negative decimal string (quantities, fill counts)
export const DecimalString = Schema.String.pipe(
  Schema.pattern(/^\d+(\.\d+)?$/),
  Schema.brand("Decimal")
)
export type DecimalString = typeof DecimalString.Type

// Strictly positive decimal string (order qty, notional, prices in requests)
export const PositiveDecimalString = Schema.String.pipe(
  Schema.pattern(/^\d+(\.\d+)?$/),
  Schema.filter((s) => Number(s) > 0 || "must be a positive decimal"),
  Schema.brand("PositiveDecimal")
)
export type PositiveDecimalString = typeof PositiveDecimalString.Type

export const TradingMode = Schema.Literal("paper", "live")
export type TradingMode = typeof TradingMode.Type

// Covers class shares (BRK.B) and hyphenated symbols
export const TickerSymbol = Schema.String.pipe(
  Schema.pattern(/^[A-Z][A-Z.\-]{0,9}$/),
  Schema.brand("TickerSymbol")
)
export type TickerSymbol = typeof TickerSymbol.Type

export const OrderId = Schema.UUID.pipe(Schema.brand("OrderId"))
export type OrderId = typeof OrderId.Type

export const ClientOrderId = Schema.String.pipe(
  Schema.minLength(1),
  Schema.maxLength(48),
  Schema.brand("ClientOrderId")
)
export type ClientOrderId = typeof ClientOrderId.Type

export const OrderSide = Schema.Literal("buy", "sell")
export type OrderSide = typeof OrderSide.Type

export const OrderType = Schema.Literal("market", "limit", "stop", "stop_limit")
export type OrderType = typeof OrderType.Type

export const TimeInForce = Schema.Literal("day", "gtc", "ioc", "fok")
export type TimeInForce = typeof TimeInForce.Type

export const OrderStatus = Schema.Literal(
  "new",
  "accepted",
  "pending_new",
  "partially_filled",
  "filled",
  "done_for_day",
  "canceled",
  "pending_cancel",
  "expired",
  "replaced",
  "pending_replace",
  "rejected",
  "suspended",
  "stopped",
  "calculated",
  "held",
  "accepted_for_bidding"
)
export type OrderStatus = typeof OrderStatus.Type
