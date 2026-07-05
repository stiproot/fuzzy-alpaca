import { HttpApiBuilder } from "@effect/platform"
import { DateTime, Effect } from "effect"
import { AppConfig } from "../../../../config.js"
import { Api } from "../api.js"

export const SystemHandlers = HttpApiBuilder.group(Api, "system", (handlers) =>
  handlers
    .handle("health", () =>
      Effect.gen(function* () {
        const config = yield* AppConfig
        const now = yield* DateTime.now
        return {
          status: "ok" as const,
          tradingMode: config.tradingMode,
          alpacaConnectivity: "unknown" as const,
          timestamp: now,
        }
      })
    )
    .handle("whoami", () =>
      Effect.gen(function* () {
        const config = yield* AppConfig
        return { authenticated: true as const, tradingMode: config.tradingMode }
      })
    )
)
