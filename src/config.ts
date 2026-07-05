import { Config, Effect } from "effect"

export class AppConfig extends Effect.Service<AppConfig>()("AppConfig", {
  effect: Effect.gen(function* () {
    const port = yield* Config.integer("PORT").pipe(Config.withDefault(3000))
    const serviceApiKey = yield* Config.redacted("SERVICE_API_KEY")
    const alpacaLive = yield* Config.boolean("ALPACA_LIVE").pipe(Config.withDefault(false))
    const tradingMode = alpacaLive ? ("live" as const) : ("paper" as const)
    return { port, serviceApiKey, tradingMode } as const
  }),
}) {}
