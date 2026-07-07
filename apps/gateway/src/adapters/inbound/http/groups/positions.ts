import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"
import { SymbolFromPath } from "../../../../domain/primitives.js"
import { OrderResponse } from "../../../../domain/schemas/order.js"
import { ClosePositionQuery, Position } from "../../../../domain/schemas/position.js"
import {
  ContractErrorT,
  InsufficientBuyingPowerT,
  InternalErrorT,
  PdtRuleViolationT,
  PositionNotFoundT,
  RateLimitedT,
  TimeoutT,
  UnavailableT,
  ValidationErrorT,
} from "../envelope.js"
import { Authorization } from "../middleware/auth.js"

const symbolPath = Schema.Struct({ symbol: SymbolFromPath })

export const positionsGroup = HttpApiGroup.make("positions")
  .add(
    HttpApiEndpoint.get("listPositions", "/v1/positions")
      .addSuccess(Schema.Array(Position))
      .addError(ValidationErrorT)
      .addError(RateLimitedT)
      .addError(UnavailableT)
      .addError(TimeoutT)
      .addError(ContractErrorT)
      .addError(InternalErrorT)
  )
  .add(
    HttpApiEndpoint.get("getPosition", "/v1/positions/:symbol")
      .setPath(symbolPath)
      .addSuccess(Position)
      .addError(PositionNotFoundT)
      .addError(ValidationErrorT)
      .addError(RateLimitedT)
      .addError(UnavailableT)
      .addError(TimeoutT)
      .addError(ContractErrorT)
      .addError(InternalErrorT)
  )
  .add(
    HttpApiEndpoint.del("closePosition", "/v1/positions/:symbol")
      .setPath(symbolPath)
      .setUrlParams(ClosePositionQuery)
      .addSuccess(OrderResponse)
      .addError(PositionNotFoundT)
      .addError(InsufficientBuyingPowerT)
      .addError(PdtRuleViolationT)
      .addError(ValidationErrorT)
      .addError(RateLimitedT)
      .addError(UnavailableT)
      .addError(TimeoutT)
      .addError(ContractErrorT)
      .addError(InternalErrorT)
  )
  .middleware(Authorization)
