import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"
import { TickerSymbol } from "../../../../domain/primitives.js"
import { Asset, AssetPage, ListAssetsQuery } from "../../../../domain/schemas/asset.js"
import { CalendarDay, CalendarQuery } from "../../../../domain/schemas/calendar.js"
import {
  AssetNotFoundT,
  ContractErrorT,
  InternalErrorT,
  RateLimitedT,
  TimeoutT,
  UnavailableT,
  ValidationErrorT,
} from "../envelope.js"
import { Authorization } from "../middleware/auth.js"

export const assetsGroup = HttpApiGroup.make("assets")
  .add(
    HttpApiEndpoint.get("listAssets", "/v1/assets")
      .setUrlParams(ListAssetsQuery)
      .addSuccess(AssetPage)
      .addError(ValidationErrorT)
      .addError(RateLimitedT)
      .addError(UnavailableT)
      .addError(TimeoutT)
      .addError(ContractErrorT)
      .addError(InternalErrorT)
  )
  .add(
    HttpApiEndpoint.get("getAsset", "/v1/assets/:symbol")
      .setPath(Schema.Struct({ symbol: TickerSymbol }))
      .addSuccess(Asset)
      .addError(AssetNotFoundT)
      .addError(ValidationErrorT)
      .addError(RateLimitedT)
      .addError(UnavailableT)
      .addError(TimeoutT)
      .addError(ContractErrorT)
      .addError(InternalErrorT)
  )
  .add(
    HttpApiEndpoint.get("getCalendar", "/v1/calendar")
      .setUrlParams(CalendarQuery)
      .addSuccess(Schema.Array(CalendarDay))
      .addError(ValidationErrorT)
      .addError(RateLimitedT)
      .addError(UnavailableT)
      .addError(TimeoutT)
      .addError(ContractErrorT)
      .addError(InternalErrorT)
  )
  .middleware(Authorization)
