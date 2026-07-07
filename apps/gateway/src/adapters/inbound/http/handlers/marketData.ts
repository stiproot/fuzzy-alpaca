import { HttpApiBuilder } from "@effect/platform"
import { Effect } from "effect"
import { MarketDataService } from "../../../../application/market-data/service.js"
import { Api } from "../api.js"

export const MarketDataHandlers = HttpApiBuilder.group(Api, "marketData", (handlers) =>
  handlers
    .handle("getQuote", ({ path }) =>
      MarketDataService.pipe(Effect.flatMap((m) => m.getQuote(path.symbol)))
    )
    .handle("getTrade", ({ path }) =>
      MarketDataService.pipe(Effect.flatMap((m) => m.getTrade(path.symbol)))
    )
    .handle("getSnapshot", ({ path }) =>
      MarketDataService.pipe(Effect.flatMap((m) => m.getSnapshot(path.symbol)))
    )
    .handle("getBars", ({ path, urlParams }) =>
      MarketDataService.pipe(Effect.flatMap((m) => m.getBars(path.symbol, urlParams)))
    )
)
