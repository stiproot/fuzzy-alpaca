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

// Crypto pair in Alpaca's canonical slash form, e.g. "BTC/USD"
export const CryptoSymbol = Schema.String.pipe(
  Schema.pattern(/^[A-Z0-9]{2,10}\/[A-Z]{2,6}$/),
  Schema.brand("CryptoSymbol")
)
export type CryptoSymbol = typeof CryptoSymbol.Type

// Any tradable symbol. The two patterns are disjoint (TickerSymbol never
// contains "/"), so the union is unambiguous.
export const AnySymbol = Schema.Union(TickerSymbol, CryptoSymbol)
export type AnySymbol = typeof AnySymbol.Type

export const isCryptoSymbol = (symbol: AnySymbol): symbol is CryptoSymbol =>
  symbol.includes("/")

// Quote currencies Alpaca pairs against — longest first so "SOLUSDT" resolves
// to SOL/USDT, not SOLUSD+T.
export const CRYPTO_QUOTE_CURRENCIES = ["USDT", "USDC", "USD", "BTC"] as const

// "BTCUSD" → "BTC/USD" (Alpaca position wire uses the slashless legacy form).
// Returns undefined when no known quote-currency suffix matches.
export const cryptoSymbolFromSlashless = (raw: string): string | undefined => {
  for (const quote of CRYPTO_QUOTE_CURRENCIES) {
    if (raw.endsWith(quote) && raw.length > quote.length) {
      return `${raw.slice(0, raw.length - quote.length)}/${quote}`
    }
  }
  return undefined
}

// URL paths cannot carry "/", so paths accept the dash form ("BTC-USD").
// Dash maps to a crypto pair ONLY when the suffix is a known quote currency —
// equity tickers like "BRK-B" pass through unchanged. Encodes crypto back to
// the dash form.
export const SymbolFromPath = Schema.transform(Schema.String, AnySymbol, {
  strict: false,
  decode: (raw) => {
    const dash = raw.lastIndexOf("-")
    if (dash > 0) {
      const suffix = raw.slice(dash + 1)
      if ((CRYPTO_QUOTE_CURRENCIES as ReadonlyArray<string>).includes(suffix)) {
        return `${raw.slice(0, dash)}/${suffix}`
      }
    }
    return raw
  },
  encode: (symbol) => (symbol.includes("/") ? symbol.replace("/", "-") : symbol),
})

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
