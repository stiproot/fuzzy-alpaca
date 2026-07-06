import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"
import { SymbolFromPath } from "../../../../domain/primitives.js"
import { BarsPage, BarsQuery, Quote, Snapshot, Trade } from "../../../../domain/schemas/market-data.js"
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

const symbolPath = Schema.Struct({ symbol: SymbolFromPath })

export const marketDataGroup = HttpApiGroup.make("marketData")
  .add(
    HttpApiEndpoint.get("getQuote", "/v1/market-data/:symbol/quote")
      .setPath(symbolPath)
      .addSuccess(Quote)
      .addError(AssetNotFoundT)
      .addError(ValidationErrorT)
      .addError(RateLimitedT)
      .addError(UnavailableT)
      .addError(TimeoutT)
      .addError(ContractErrorT)
      .addError(InternalErrorT)
  )
  .add(
    HttpApiEndpoint.get("getTrade", "/v1/market-data/:symbol/trade")
      .setPath(symbolPath)
      .addSuccess(Trade)
      .addError(AssetNotFoundT)
      .addError(ValidationErrorT)
      .addError(RateLimitedT)
      .addError(UnavailableT)
      .addError(TimeoutT)
      .addError(ContractErrorT)
      .addError(InternalErrorT)
  )
  .add(
    HttpApiEndpoint.get("getSnapshot", "/v1/market-data/:symbol/snapshot")
      .setPath(symbolPath)
      .addSuccess(Snapshot)
      .addError(AssetNotFoundT)
      .addError(ValidationErrorT)
      .addError(RateLimitedT)
      .addError(UnavailableT)
      .addError(TimeoutT)
      .addError(ContractErrorT)
      .addError(InternalErrorT)
  )
  .add(
    HttpApiEndpoint.get("getBars", "/v1/market-data/:symbol/bars")
      .setPath(symbolPath)
      .setUrlParams(BarsQuery)
      .addSuccess(BarsPage)
      .addError(AssetNotFoundT)
      .addError(ValidationErrorT)
      .addError(RateLimitedT)
      .addError(UnavailableT)
      .addError(TimeoutT)
      .addError(ContractErrorT)
      .addError(InternalErrorT)
  )
  .middleware(Authorization)
