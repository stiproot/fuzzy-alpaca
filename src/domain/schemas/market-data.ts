import { Schema } from "effect"
import { TickerSymbol } from "../primitives.js"

// Market-data prices are JSON numbers on Alpaca's data API (unlike the
// trading API's money strings) and are informational, not transactional —
// they stay numbers.

const fromWire = <A, I, R>(schema: Schema.Schema<A, I, R>, wireKey: string) =>
  Schema.propertySignature(schema).pipe(Schema.fromKey(wireKey))

// ---- Quote ----

const quoteDataFields = {
  timestamp: Schema.DateTimeUtc,
  askPrice: Schema.Number,
  askSize: Schema.Number,
  bidPrice: Schema.Number,
  bidSize: Schema.Number,
}

export const Quote = Schema.Struct({ symbol: TickerSymbol, ...quoteDataFields })
export type Quote = typeof Quote.Type

export const QuoteDataFromWire = Schema.Struct({
  timestamp: fromWire(Schema.DateTimeUtc, "t"),
  askPrice: fromWire(Schema.Number, "ap"),
  askSize: fromWire(Schema.Number, "as"),
  bidPrice: fromWire(Schema.Number, "bp"),
  bidSize: fromWire(Schema.Number, "bs"),
})

export const LatestQuoteFromWire = Schema.Struct({
  symbol: TickerSymbol,
  quote: QuoteDataFromWire,
})

// ---- Trade ----

const tradeDataFields = {
  timestamp: Schema.DateTimeUtc,
  price: Schema.Number,
  size: Schema.Number,
}

export const Trade = Schema.Struct({ symbol: TickerSymbol, ...tradeDataFields })
export type Trade = typeof Trade.Type

export const TradeDataFromWire = Schema.Struct({
  timestamp: fromWire(Schema.DateTimeUtc, "t"),
  price: fromWire(Schema.Number, "p"),
  size: fromWire(Schema.Number, "s"),
})

export const LatestTradeFromWire = Schema.Struct({
  symbol: TickerSymbol,
  trade: TradeDataFromWire,
})

// ---- Bar ----

export const Bar = Schema.Struct({
  timestamp: Schema.DateTimeUtc,
  open: Schema.Number,
  high: Schema.Number,
  low: Schema.Number,
  close: Schema.Number,
  volume: Schema.Number,
  tradeCount: Schema.optional(Schema.Number),
  vwap: Schema.optional(Schema.Number),
})
export type Bar = typeof Bar.Type

export const BarFromWire = Schema.Struct({
  timestamp: fromWire(Schema.DateTimeUtc, "t"),
  open: fromWire(Schema.Number, "o"),
  high: fromWire(Schema.Number, "h"),
  low: fromWire(Schema.Number, "l"),
  close: fromWire(Schema.Number, "c"),
  volume: fromWire(Schema.Number, "v"),
  tradeCount: Schema.optional(Schema.Number).pipe(Schema.fromKey("n")),
  vwap: Schema.optional(Schema.Number).pipe(Schema.fromKey("vw")),
})

// ---- Snapshot ----

export const Snapshot = Schema.Struct({
  symbol: TickerSymbol,
  latestQuote: Schema.OptionFromNullOr(Schema.Struct(quoteDataFields)),
  latestTrade: Schema.OptionFromNullOr(Schema.Struct(tradeDataFields)),
  minuteBar: Schema.OptionFromNullOr(Bar),
  dailyBar: Schema.OptionFromNullOr(Bar),
  prevDailyBar: Schema.OptionFromNullOr(Bar),
})
export type Snapshot = typeof Snapshot.Type

export const SnapshotFromWire = Schema.Struct({
  symbol: TickerSymbol,
  latestQuote: Schema.OptionFromNullOr(QuoteDataFromWire),
  latestTrade: Schema.OptionFromNullOr(TradeDataFromWire),
  minuteBar: Schema.OptionFromNullOr(BarFromWire),
  dailyBar: Schema.OptionFromNullOr(BarFromWire),
  prevDailyBar: Schema.OptionFromNullOr(BarFromWire),
})

// ---- Bars page (real Alpaca next_page_token) ----

export const BarsPage = Schema.Struct({
  symbol: TickerSymbol,
  items: Schema.Array(Bar),
  nextPageToken: Schema.optional(Schema.String),
})
export type BarsPage = typeof BarsPage.Type

export const BarsPageFromWire = Schema.Struct({
  symbol: TickerSymbol,
  bars: Schema.OptionFromNullOr(Schema.Array(BarFromWire)),
  nextPageToken: Schema.propertySignature(Schema.OptionFromNullOr(Schema.String)).pipe(
    Schema.fromKey("next_page_token")
  ),
})

// ---- Queries ----

export const BarsQuery = Schema.Struct({
  timeframe: Schema.String.pipe(Schema.pattern(/^\d+(Min|Hour|Day|Week|Month)$/)),
  /** ISO-8601 or YYYY-MM-DD */
  start: Schema.optional(Schema.String),
  end: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.NumberFromString.pipe(Schema.int(), Schema.between(1, 1000))),
  pageToken: Schema.optional(Schema.String),
  adjustment: Schema.optional(Schema.Literal("raw", "split", "dividend", "all")),
})
export type BarsQuery = typeof BarsQuery.Type
