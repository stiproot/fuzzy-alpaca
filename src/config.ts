import { Config, Effect } from "effect"

export class AppConfig extends Effect.Service<AppConfig>()("AppConfig", {
  effect: Effect.gen(function* () {
    const port = yield* Config.integer("PORT").pipe(Config.withDefault(3000))
    const serviceApiKey = yield* Config.redacted("SERVICE_API_KEY")
    const alpacaKeyId = yield* Config.redacted("APCA_API_KEY_ID")
    const alpacaSecretKey = yield* Config.redacted("APCA_API_SECRET_KEY")
    const alpacaLive = yield* Config.boolean("ALPACA_LIVE").pipe(Config.withDefault(false))
    const feed = yield* Config.literal("iex", "sip")("FEED").pipe(Config.withDefault("iex" as const))
    const tradingMode = alpacaLive ? ("live" as const) : ("paper" as const)
    return { port, serviceApiKey, alpacaKeyId, alpacaSecretKey, tradingMode, feed } as const
  }),
}) {}
