import { Schema } from "effect"
import { AnySymbol, DecimalString, MoneyString } from "../primitives.js"

export const PositionSide = Schema.Literal("long", "short")

// The P&L surface agents size decisions on. Price/PL fields are nullable on
// the wire in edge states (fresh positions, halted symbols), hence Options.
export const Position = Schema.Struct({
  assetId: Schema.String,
  symbol: AnySymbol,
  exchange: Schema.String,
  assetClass: Schema.String,
  side: PositionSide,
  qty: DecimalString,
  qtyAvailable: DecimalString,
  avgEntryPrice: MoneyString,
  costBasis: MoneyString,
  marketValue: Schema.OptionFromNullOr(MoneyString),
  currentPrice: Schema.OptionFromNullOr(MoneyString),
  lastdayPrice: Schema.OptionFromNullOr(MoneyString),
  unrealizedPl: Schema.OptionFromNullOr(MoneyString),
  unrealizedPlpc: Schema.OptionFromNullOr(MoneyString),
  unrealizedIntradayPl: Schema.OptionFromNullOr(MoneyString),
  unrealizedIntradayPlpc: Schema.OptionFromNullOr(MoneyString),
  changeToday: Schema.OptionFromNullOr(MoneyString),
})
export type Position = typeof Position.Type

const fromWire = <A, I, R>(schema: Schema.Schema<A, I, R>, wireKey: string) =>
  Schema.propertySignature(schema).pipe(Schema.fromKey(wireKey))

const optionalWire = <A, I, R>(schema: Schema.Schema<A, I, R>, wireKey: string) =>
  Schema.propertySignature(Schema.OptionFromNullOr(schema)).pipe(Schema.fromKey(wireKey))

export const PositionFromWire = Schema.Struct({
  assetId: fromWire(Schema.String, "asset_id"),
  symbol: AnySymbol,
  exchange: Schema.String,
  assetClass: fromWire(Schema.String, "asset_class"),
  side: PositionSide,
  qty: DecimalString,
  qtyAvailable: fromWire(DecimalString, "qty_available"),
  avgEntryPrice: fromWire(MoneyString, "avg_entry_price"),
  costBasis: fromWire(MoneyString, "cost_basis"),
  marketValue: optionalWire(MoneyString, "market_value"),
  currentPrice: optionalWire(MoneyString, "current_price"),
  lastdayPrice: optionalWire(MoneyString, "lastday_price"),
  unrealizedPl: optionalWire(MoneyString, "unrealized_pl"),
  unrealizedPlpc: optionalWire(MoneyString, "unrealized_plpc"),
  unrealizedIntradayPl: optionalWire(MoneyString, "unrealized_intraday_pl"),
  unrealizedIntradayPlpc: optionalWire(MoneyString, "unrealized_intraday_plpc"),
  changeToday: optionalWire(MoneyString, "change_today"),
})

// Close request: full close by default; partial via qty XOR percentage.
export const ClosePositionQuery = Schema.Struct({
  qty: Schema.optional(Schema.String),
  percentage: Schema.optional(Schema.String),
})
export type ClosePositionQuery = typeof ClosePositionQuery.Type
