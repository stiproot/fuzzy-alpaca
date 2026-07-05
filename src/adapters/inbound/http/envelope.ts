import { HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"
import * as E from "../../../domain/errors.js"

// Wire contract for every non-2xx response:
//   { error: { code, message, retryable, requestId?, details? } }
// A "transport" schema wraps a domain tagged error so that the HTTP layer
// (and the generated OpenAPI) sees the envelope while handlers and middleware
// keep failing with plain domain error instances.

const envelopeStruct = <Tag extends string>(code: Tag) =>
  Schema.Struct({
    error: Schema.Struct({
      code: Schema.Literal(code),
      message: Schema.String,
      retryable: Schema.Boolean,
      requestId: Schema.optional(Schema.String),
      details: Schema.optional(Schema.Unknown),
    }),
  })

// Extra error payload beyond `message` (retryAfterSeconds, op, ...) rides in
// the envelope's `details` via the encodeDetails/decodeDetails codec pair.
export const transport = <Tag extends string, Self extends { readonly _tag: Tag; readonly message: string }>(
  ErrorClass: Schema.Schema<Self, any>,
  tag: Tag,
  opts: {
    readonly status: number
    readonly retryable: boolean
    readonly encodeDetails?: (e: Self) => unknown
    readonly decodeDetails?: (details: unknown) => Record<string, unknown>
  }
) =>
  Schema.transform(envelopeStruct(tag), ErrorClass, {
    strict: false,
    decode: (env) => ({
      _tag: tag,
      message: env.error.message,
      ...(opts.decodeDetails ? opts.decodeDetails(env.error.details) : {}),
    }),
    encode: (e) => {
      const details = opts.encodeDetails?.(e)
      return {
        error: {
          code: tag,
          message: e.message,
          retryable: opts.retryable,
          ...(details !== undefined ? { details } : {}),
        },
      }
    },
  }).annotations(HttpApiSchema.annotations({ status: opts.status }))

const detailsRecord = (details: unknown): Record<string, unknown> =>
  typeof details === "object" && details !== null ? (details as Record<string, unknown>) : {}

export const ValidationErrorT = transport(E.ValidationError, "ValidationError", {
  status: 400,
  retryable: false,
  encodeDetails: (e) => e.details,
  decodeDetails: (d) => (d === undefined ? {} : { details: d }),
})

export const RateLimitedT = transport(E.AlpacaRateLimited, "AlpacaRateLimited", {
  status: 429,
  retryable: true,
  encodeDetails: (e) =>
    e.retryAfterSeconds !== undefined ? { retryAfterSeconds: e.retryAfterSeconds } : undefined,
  decodeDetails: (d) => {
    const r = detailsRecord(d)
    return typeof r["retryAfterSeconds"] === "number" ? { retryAfterSeconds: r["retryAfterSeconds"] } : {}
  },
})

export const UnavailableT = transport(E.AlpacaUnavailable, "AlpacaUnavailable", {
  status: 503,
  retryable: true,
})

export const TimeoutT = transport(E.AlpacaTimeout, "AlpacaTimeout", {
  status: 503,
  retryable: true,
  encodeDetails: (e) => ({ op: e.op }),
  decodeDetails: (d) => ({ op: String(detailsRecord(d)["op"] ?? "unknown") }),
})

export const ContractErrorT = transport(E.AlpacaContractError, "AlpacaContractError", {
  status: 500,
  retryable: false,
  encodeDetails: (e) => ({ op: e.op, parseError: e.parseError }),
  decodeDetails: (d) => {
    const r = detailsRecord(d)
    return { op: String(r["op"] ?? "unknown"), parseError: String(r["parseError"] ?? "") }
  },
})

export const InternalErrorT = transport(E.InternalError, "InternalError", {
  status: 500,
  retryable: false,
})

export const UnauthorizedT = transport(E.Unauthorized, "Unauthorized", {
  status: 401,
  retryable: false,
})

export const OrderNotFoundT = transport(E.OrderNotFound, "OrderNotFound", {
  status: 404,
  retryable: false,
})

export const OrderNotCancelableT = transport(E.OrderNotCancelable, "OrderNotCancelable", {
  status: 409,
  retryable: false,
})

export const ConfirmationRequiredT = transport(E.ConfirmationRequired, "ConfirmationRequired", {
  status: 409,
  retryable: false,
})

export const AssetNotFoundT = transport(E.AssetNotFound, "AssetNotFound", {
  status: 404,
  retryable: false,
})

export const AssetNotTradableT = transport(E.AssetNotTradable, "AssetNotTradable", {
  status: 422,
  retryable: false,
})

export const MaxOrderSizeExceededT = transport(E.MaxOrderSizeExceeded, "MaxOrderSizeExceeded", {
  status: 422,
  retryable: false,
})

const alpacaCodeDetails = {
  encodeDetails: (e: { readonly alpacaCode?: number | undefined }) =>
    e.alpacaCode !== undefined ? { alpacaCode: e.alpacaCode } : undefined,
  decodeDetails: (d: unknown) => {
    const r = detailsRecord(d)
    return typeof r["alpacaCode"] === "number" ? { alpacaCode: r["alpacaCode"] } : {}
  },
}

export const InsufficientBuyingPowerT = transport(E.InsufficientBuyingPower, "InsufficientBuyingPower", {
  status: 422,
  retryable: false,
  ...alpacaCodeDetails,
})

export const PdtRuleViolationT = transport(E.PdtRuleViolation, "PdtRuleViolation", {
  status: 422,
  retryable: false,
  ...alpacaCodeDetails,
})
