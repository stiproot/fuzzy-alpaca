import { HttpApiSchema } from "@effect/platform"
import { Schema } from "effect"

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

// Works for domain errors whose only wire-relevant field is `message`.
// Errors with extra payload (retryAfterSeconds, ...) get dedicated transports
// when their endpoints land.
export const transport = <Tag extends string, Self extends { readonly _tag: Tag; readonly message: string }>(
  ErrorClass: Schema.Schema<Self, { readonly _tag: Tag; readonly message: string }>,
  tag: Tag,
  opts: { readonly status: number; readonly retryable: boolean }
) =>
  Schema.transform(envelopeStruct(tag), ErrorClass, {
    strict: false,
    decode: (env) => ({ _tag: tag, message: env.error.message }),
    encode: (e) => ({ error: { code: tag, message: e.message, retryable: opts.retryable } }),
  }).annotations(HttpApiSchema.annotations({ status: opts.status }))
