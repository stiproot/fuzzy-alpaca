import { Effect, Option } from "effect"
import type { AlpacaError, AssetNotFound } from "../../domain/errors.js"
import type { TickerSymbol } from "../../domain/primitives.js"
import type { Asset, AssetPage, ListAssetsQuery } from "../../domain/schemas/asset.js"
import type { CalendarDay, CalendarQuery } from "../../domain/schemas/calendar.js"
import type { BarsPage, BarsQuery, Quote, Snapshot, Trade } from "../../domain/schemas/market-data.js"
import { AlpacaClient } from "../../ports/broker.js"

export class MarketDataService extends Effect.Service<MarketDataService>()("MarketDataService", {
  effect: Effect.gen(function* () {
    const broker = yield* AlpacaClient

    return {
      getQuote: (symbol: TickerSymbol): Effect.Effect<Quote, AlpacaError | AssetNotFound> =>
        broker.getLatestQuote(symbol),

      getTrade: (symbol: TickerSymbol): Effect.Effect<Trade, AlpacaError | AssetNotFound> =>
        broker.getLatestTrade(symbol),

      getSnapshot: (symbol: TickerSymbol): Effect.Effect<Snapshot, AlpacaError | AssetNotFound> =>
        broker.getSnapshot(symbol),

      getBars: (
        symbol: TickerSymbol,
        query: BarsQuery
      ): Effect.Effect<BarsPage, AlpacaError | AssetNotFound> =>
        broker.getBars(symbol, {
          timeframe: query.timeframe,
          start: query.start,
          end: query.end,
          limit: query.limit ?? 100,
          adjustment: query.adjustment,
          pageToken: query.pageToken,
        }),

      // Alpaca's assets endpoint returns the full universe unpaginated
      // (thousands of entries); search + limit keep responses agent-sized.
      listAssets: (query: ListAssetsQuery): Effect.Effect<AssetPage, AlpacaError> =>
        broker.getAssets({ status: query.status ?? "active" }).pipe(
          Effect.map((all) => {
            const prefix = query.search?.toUpperCase()
            const matches = all.filter(
              (asset) =>
                (query.tradable === undefined || asset.tradable === query.tradable) &&
                (prefix === undefined || asset.symbol.startsWith(prefix))
            )
            return { items: matches.slice(0, query.limit ?? 100), totalMatches: matches.length }
          }),
          Effect.withSpan("marketData.listAssets")
        ),

      getAsset: (symbol: TickerSymbol): Effect.Effect<Option.Option<Asset>, AlpacaError> =>
        broker.getAsset(symbol),

      getCalendar: (query: CalendarQuery): Effect.Effect<ReadonlyArray<CalendarDay>, AlpacaError> =>
        broker.getCalendar({ start: query.start, end: query.end }),
    }
  }),
}) {}
