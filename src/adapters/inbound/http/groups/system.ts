import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"
import { Account } from "../../../../domain/schemas/account.js"
import { Clock } from "../../../../domain/schemas/clock.js"
import { TradingMode } from "../../../../domain/primitives.js"
import {
  ContractErrorT,
  InternalErrorT,
  RateLimitedT,
  TimeoutT,
  UnavailableT,
  ValidationErrorT,
} from "../envelope.js"
import { Authorization } from "../middleware/auth.js"

export const HealthResponse = Schema.Struct({
  status: Schema.Literal("ok"),
  tradingMode: TradingMode,
  alpacaConnectivity: Schema.Literal("ok", "degraded"),
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
  .add(
    HttpApiEndpoint.get("getAccount", "/v1/account")
      .addSuccess(Account)
      .addError(ValidationErrorT)
      .addError(RateLimitedT)
      .addError(UnavailableT)
      .addError(TimeoutT)
      .addError(ContractErrorT)
      .addError(InternalErrorT)
      .middleware(Authorization)
  )
  .add(
    HttpApiEndpoint.get("getClock", "/v1/clock")
      .addSuccess(Clock)
      .addError(ValidationErrorT)
      .addError(RateLimitedT)
      .addError(UnavailableT)
      .addError(TimeoutT)
      .addError(ContractErrorT)
      .addError(InternalErrorT)
      .middleware(Authorization)
  )
