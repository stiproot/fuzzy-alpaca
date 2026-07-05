import { HttpApiBuilder } from "@effect/platform"
import { Effect, Option } from "effect"
import { TradingService } from "../../../../application/trading/service.js"
import { PositionNotFound } from "../../../../domain/errors.js"
import { Api } from "../api.js"

export const PositionsHandlers = HttpApiBuilder.group(Api, "positions", (handlers) =>
  handlers
    .handle("listPositions", () => TradingService.pipe(Effect.flatMap((t) => t.listPositions())))
    .handle("getPosition", ({ path }) =>
      TradingService.pipe(
        Effect.flatMap((t) => t.getPosition(path.symbol)),
        // "no position" is a domain Option; only here does it become a 404
        Effect.flatMap(
          Option.match({
            onNone: () =>
              Effect.fail(new PositionNotFound({ message: `no open position in ${path.symbol}` })),
            onSome: Effect.succeed,
          })
        )
      )
    )
    .handle("closePosition", ({ path, urlParams }) =>
      TradingService.pipe(Effect.flatMap((t) => t.closePosition(path.symbol, urlParams)))
    )
)
