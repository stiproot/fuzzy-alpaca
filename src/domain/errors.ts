import { Schema } from "effect"

// The closed error set of the service. Every failure that can cross the API
// boundary is one of these tags; the HTTP adapter owns the status/retryable
// mapping and the wire envelope (see adapters/inbound/http/envelope.ts).

export class ValidationError extends Schema.TaggedError<ValidationError>()("ValidationError", {
  message: Schema.String,
  details: Schema.optional(Schema.Unknown),
}) {}

export class Unauthorized extends Schema.TaggedError<Unauthorized>()("Unauthorized", {
  message: Schema.String,
}) {}

export class OrderNotFound extends Schema.TaggedError<OrderNotFound>()("OrderNotFound", {
  message: Schema.String,
}) {}

export class PositionNotFound extends Schema.TaggedError<PositionNotFound>()("PositionNotFound", {
  message: Schema.String,
}) {}

export class AssetNotFound extends Schema.TaggedError<AssetNotFound>()("AssetNotFound", {
  message: Schema.String,
}) {}

export class OrderNotCancelable extends Schema.TaggedError<OrderNotCancelable>()("OrderNotCancelable", {
  message: Schema.String,
}) {}

export class ConfirmationRequired extends Schema.TaggedError<ConfirmationRequired>()("ConfirmationRequired", {
  message: Schema.String,
}) {}

export class InsufficientBuyingPower extends Schema.TaggedError<InsufficientBuyingPower>()("InsufficientBuyingPower", {
  message: Schema.String,
  alpacaCode: Schema.optional(Schema.Number),
}) {}

export class PdtRuleViolation extends Schema.TaggedError<PdtRuleViolation>()("PdtRuleViolation", {
  message: Schema.String,
  alpacaCode: Schema.optional(Schema.Number),
}) {}

export class MarketClosed extends Schema.TaggedError<MarketClosed>()("MarketClosed", {
  message: Schema.String,
}) {}

export class AssetNotTradable extends Schema.TaggedError<AssetNotTradable>()("AssetNotTradable", {
  message: Schema.String,
}) {}

export class MaxOrderSizeExceeded extends Schema.TaggedError<MaxOrderSizeExceeded>()("MaxOrderSizeExceeded", {
  message: Schema.String,
}) {}

export class AlpacaRateLimited extends Schema.TaggedError<AlpacaRateLimited>()("AlpacaRateLimited", {
  message: Schema.String,
  retryAfterSeconds: Schema.optional(Schema.Number),
}) {}

export class AlpacaUnavailable extends Schema.TaggedError<AlpacaUnavailable>()("AlpacaUnavailable", {
  message: Schema.String,
}) {}

export class AlpacaTimeout extends Schema.TaggedError<AlpacaTimeout>()("AlpacaTimeout", {
  message: Schema.String,
  op: Schema.String,
}) {}

export class AlpacaContractError extends Schema.TaggedError<AlpacaContractError>()("AlpacaContractError", {
  message: Schema.String,
  op: Schema.String,
  parseError: Schema.String,
}) {}

export class InternalError extends Schema.TaggedError<InternalError>()("InternalError", {
  message: Schema.String,
}) {}

// Internal-only: Alpaca rejected a create because the clientOrderId already
// exists. Never crosses the HTTP boundary — the application layer converts it
// into an idempotent replay of the existing order.
export class DuplicateClientOrderId extends Schema.TaggedError<DuplicateClientOrderId>()(
  "DuplicateClientOrderId",
  { message: Schema.String }
) {}

// The transport-level failures any Alpaca-backed operation can produce.
// Business errors (InsufficientBuyingPower, ...) are added per-method by the
// operations that can actually raise them.
export type AlpacaError =
  | AlpacaRateLimited
  | AlpacaUnavailable
  | AlpacaTimeout
  | AlpacaContractError
  | ValidationError
  | InternalError

export const isRetryableAlpacaError = (e: AlpacaError): boolean =>
  e._tag === "AlpacaRateLimited" || e._tag === "AlpacaUnavailable" || e._tag === "AlpacaTimeout"
