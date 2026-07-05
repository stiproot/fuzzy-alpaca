import { Schema } from "effect"
import { MoneyString } from "../primitives.js"

// Domain shape — also the HTTP success contract (camelCase, ISO-8601 UTC out).
export const Account = Schema.Struct({
  id: Schema.String,
  accountNumber: Schema.String,
  status: Schema.String,
  currency: Schema.String,
  buyingPower: MoneyString,
  regtBuyingPower: MoneyString,
  daytradingBuyingPower: MoneyString,
  cash: MoneyString,
  equity: MoneyString,
  lastEquity: MoneyString,
  longMarketValue: MoneyString,
  shortMarketValue: MoneyString,
  multiplier: Schema.String,
  patternDayTrader: Schema.Boolean,
  daytradeCount: Schema.Number,
  shortingEnabled: Schema.Boolean,
  tradingBlocked: Schema.Boolean,
  transfersBlocked: Schema.Boolean,
  accountBlocked: Schema.Boolean,
  createdAt: Schema.DateTimeUtc,
})
export type Account = typeof Account.Type

const fromWire = <A, I, R>(schema: Schema.Schema<A, I, R>, wireKey: string) =>
  Schema.propertySignature(schema).pipe(Schema.fromKey(wireKey))

// Decode schema for Alpaca's wire shape (snake_case, stringly-numbered).
// Type-side is structurally identical to Account.
export const AccountFromWire = Schema.Struct({
  id: Schema.String,
  accountNumber: fromWire(Schema.String, "account_number"),
  status: Schema.String,
  currency: Schema.String,
  buyingPower: fromWire(MoneyString, "buying_power"),
  regtBuyingPower: fromWire(MoneyString, "regt_buying_power"),
  daytradingBuyingPower: fromWire(MoneyString, "daytrading_buying_power"),
  cash: MoneyString,
  equity: MoneyString,
  lastEquity: fromWire(MoneyString, "last_equity"),
  longMarketValue: fromWire(MoneyString, "long_market_value"),
  shortMarketValue: fromWire(MoneyString, "short_market_value"),
  multiplier: Schema.String,
  patternDayTrader: fromWire(Schema.Boolean, "pattern_day_trader"),
  daytradeCount: fromWire(Schema.Number, "daytrade_count"),
  shortingEnabled: fromWire(Schema.Boolean, "shorting_enabled"),
  tradingBlocked: fromWire(Schema.Boolean, "trading_blocked"),
  transfersBlocked: fromWire(Schema.Boolean, "transfers_blocked"),
  accountBlocked: fromWire(Schema.Boolean, "account_blocked"),
  createdAt: fromWire(Schema.DateTimeUtc, "created_at"),
})
