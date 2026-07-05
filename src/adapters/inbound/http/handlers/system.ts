import { HttpApiBuilder } from "@effect/platform"
import { DateTime, Effect, Metric } from "effect"
import { TradingService } from "../../../../application/trading/service.js"
import { AppConfig } from "../../../../config.js"
import { Api } from "../api.js"
import { formatPrometheus } from "../prometheus.js"

export const SystemHandlers = HttpApiBuilder.group(Api, "system", (handlers) =>
  handlers
    .handle("health", () =>
      Effect.gen(function* () {
        const config = yield* AppConfig
        const trading = yield* TradingService
        const alpacaConnectivity = yield* trading.connectivity()
        const now = yield* DateTime.now
        return {
          status: "ok" as const,
          tradingMode: config.tradingMode,
          alpacaConnectivity,
          timestamp: now,
        }
      })
    )
    .handle("metrics", () => Metric.snapshot.pipe(Effect.map(formatPrometheus)))
    .handle("whoami", () =>
      Effect.gen(function* () {
        const config = yield* AppConfig
        return { authenticated: true as const, tradingMode: config.tradingMode }
      })
    )
    .handle("getAccount", () => TradingService.pipe(Effect.flatMap((t) => t.getAccount())))
    .handle("getClock", () => TradingService.pipe(Effect.flatMap((t) => t.getClock())))
)
