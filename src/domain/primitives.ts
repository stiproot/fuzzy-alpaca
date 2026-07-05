import { Schema } from "effect"

// Alpaca returns monetary quantities as JSON strings. They stay validated
// decimal strings end-to-end — never floats — so real money never drifts.
export const MoneyString = Schema.String.pipe(
  Schema.pattern(/^-?\d+(\.\d+)?$/),
  Schema.brand("Money")
)
export type MoneyString = typeof MoneyString.Type

export const TradingMode = Schema.Literal("paper", "live")
export type TradingMode = typeof TradingMode.Type
