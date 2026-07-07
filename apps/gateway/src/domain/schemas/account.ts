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
  // Absent on accounts under Alpaca's post-PDT intraday margin framework
  daytradingBuyingPower: Schema.optionalWith(MoneyString, { as: "Option", nullable: true }),
  cash: MoneyString,
  equity: MoneyString,
  lastEquity: MoneyString,
  longMarketValue: MoneyString,
  shortMarketValue: MoneyString,
  multiplier: Schema.String,
  // PDT-era fields, absent on accounts under the post-June-2026 intraday
  // margin framework
  patternDayTrader: Schema.optionalWith(Schema.Boolean, { as: "Option", nullable: true }),
  daytradeCount: Schema.optionalWith(Schema.Number, { as: "Option", nullable: true }),
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
  daytradingBuyingPower: Schema.optionalWith(MoneyString, { as: "Option", nullable: true }).pipe(
    Schema.fromKey("daytrading_buying_power")
  ),
  cash: MoneyString,
  equity: MoneyString,
  lastEquity: fromWire(MoneyString, "last_equity"),
  longMarketValue: fromWire(MoneyString, "long_market_value"),
  shortMarketValue: fromWire(MoneyString, "short_market_value"),
  multiplier: Schema.String,
  patternDayTrader: Schema.optionalWith(Schema.Boolean, { as: "Option", nullable: true }).pipe(
    Schema.fromKey("pattern_day_trader")
  ),
  daytradeCount: Schema.optionalWith(Schema.Number, { as: "Option", nullable: true }).pipe(
    Schema.fromKey("daytrade_count")
  ),
  shortingEnabled: fromWire(Schema.Boolean, "shorting_enabled"),
  tradingBlocked: fromWire(Schema.Boolean, "trading_blocked"),
  transfersBlocked: fromWire(Schema.Boolean, "transfers_blocked"),
  accountBlocked: fromWire(Schema.Boolean, "account_blocked"),
  createdAt: fromWire(Schema.DateTimeUtc, "created_at"),
})
