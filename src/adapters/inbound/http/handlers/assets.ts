import { HttpApiBuilder } from "@effect/platform"
import { Effect, Option } from "effect"
import { MarketDataService } from "../../../../application/market-data/service.js"
import { AssetNotFound } from "../../../../domain/errors.js"
import { Api } from "../api.js"

export const AssetsHandlers = HttpApiBuilder.group(Api, "assets", (handlers) =>
  handlers
    .handle("listAssets", ({ urlParams }) =>
      MarketDataService.pipe(Effect.flatMap((m) => m.listAssets(urlParams)))
    )
    .handle("getAsset", ({ path }) =>
      MarketDataService.pipe(
        Effect.flatMap((m) => m.getAsset(path.symbol)),
        Effect.flatMap(
          Option.match({
            onNone: () =>
              Effect.fail(new AssetNotFound({ message: `asset ${path.symbol} not found` })),
            onSome: Effect.succeed,
          })
        )
      )
    )
    .handle("getCalendar", ({ urlParams }) =>
      MarketDataService.pipe(Effect.flatMap((m) => m.getCalendar(urlParams)))
    )
)
