import { Schema } from "effect"
import { AnySymbol } from "../primitives.js"

export const Asset = Schema.Struct({
  id: Schema.String,
  assetClass: Schema.String,
  exchange: Schema.String,
  symbol: AnySymbol,
  status: Schema.String,
  tradable: Schema.Boolean,
  marginable: Schema.Boolean,
  shortable: Schema.Boolean,
  fractionable: Schema.Boolean,
  easyToBorrow: Schema.Boolean,
  // Crypto-only sizing constraints (decimal strings; absent on equities)
  minOrderSize: Schema.optional(Schema.String),
  minTradeIncrement: Schema.optional(Schema.String),
  priceIncrement: Schema.optional(Schema.String),
})
export type Asset = typeof Asset.Type

const fromWire = <A, I, R>(schema: Schema.Schema<A, I, R>, wireKey: string) =>
  Schema.propertySignature(schema).pipe(Schema.fromKey(wireKey))

export const AssetFromWire = Schema.Struct({
  id: Schema.String,
  assetClass: fromWire(Schema.String, "class"),
  exchange: Schema.String,
  symbol: AnySymbol,
  status: Schema.String,
  tradable: Schema.Boolean,
  marginable: Schema.Boolean,
  shortable: Schema.Boolean,
  fractionable: Schema.Boolean,
  easyToBorrow: fromWire(Schema.Boolean, "easy_to_borrow"),
  minOrderSize: Schema.optional(Schema.String).pipe(Schema.fromKey("min_order_size")),
  minTradeIncrement: Schema.optional(Schema.String).pipe(Schema.fromKey("min_trade_increment")),
  priceIncrement: Schema.optional(Schema.String).pipe(Schema.fromKey("price_increment")),
})

export const ListAssetsQuery = Schema.Struct({
  status: Schema.optional(Schema.Literal("active", "inactive")),
  tradable: Schema.optional(Schema.BooleanFromString),
  /** case-insensitive symbol prefix */
  search: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.NumberFromString.pipe(Schema.int(), Schema.between(1, 1000))),
})
export type ListAssetsQuery = typeof ListAssetsQuery.Type

export const AssetPage = Schema.Struct({
  items: Schema.Array(Asset),
  /** total matches before the limit was applied */
  totalMatches: Schema.Number,
})
export type AssetPage = typeof AssetPage.Type
