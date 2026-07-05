import { Schema } from "effect"
import { TickerSymbol } from "../primitives.js"

export const Asset = Schema.Struct({
  id: Schema.String,
  assetClass: Schema.String,
  exchange: Schema.String,
  symbol: TickerSymbol,
  status: Schema.String,
  tradable: Schema.Boolean,
  marginable: Schema.Boolean,
  shortable: Schema.Boolean,
  fractionable: Schema.Boolean,
  easyToBorrow: Schema.Boolean,
})
export type Asset = typeof Asset.Type

const fromWire = <A, I, R>(schema: Schema.Schema<A, I, R>, wireKey: string) =>
  Schema.propertySignature(schema).pipe(Schema.fromKey(wireKey))

export const AssetFromWire = Schema.Struct({
  id: Schema.String,
  assetClass: fromWire(Schema.String, "class"),
  exchange: Schema.String,
  symbol: TickerSymbol,
  status: Schema.String,
  tradable: Schema.Boolean,
  marginable: Schema.Boolean,
  shortable: Schema.Boolean,
  fractionable: Schema.Boolean,
  easyToBorrow: fromWire(Schema.Boolean, "easy_to_borrow"),
})
