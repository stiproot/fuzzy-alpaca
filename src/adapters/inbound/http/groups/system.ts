import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"
import { Authorization } from "../middleware/auth.js"

const TradingMode = Schema.Literal("paper", "live")

export const HealthResponse = Schema.Struct({
  status: Schema.Literal("ok"),
  tradingMode: TradingMode,
  // "unknown" until milestone 2 wires the real Alpaca clock probe
  alpacaConnectivity: Schema.Literal("ok", "degraded", "unknown"),
  timestamp: Schema.DateTimeUtc,
})

export const WhoamiResponse = Schema.Struct({
  authenticated: Schema.Literal(true),
  tradingMode: TradingMode,
})

export const systemGroup = HttpApiGroup.make("system")
  .add(HttpApiEndpoint.get("health", "/health").addSuccess(HealthResponse))
  .add(
    HttpApiEndpoint.get("whoami", "/v1/whoami")
      .addSuccess(WhoamiResponse)
      .middleware(Authorization)
  )
