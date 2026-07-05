import { HttpApiMiddleware, HttpApiSecurity } from "@effect/platform"
import { Effect, Layer, Redacted } from "effect"
import { createHash, timingSafeEqual } from "node:crypto"
import { AppConfig } from "../../../../config.js"
import { Unauthorized } from "../../../../domain/errors.js"
import { transport } from "../envelope.js"

export const UnauthorizedTransport = transport(Unauthorized, "Unauthorized", {
  status: 401,
  retryable: false,
})

export class Authorization extends HttpApiMiddleware.Tag<Authorization>()("Authorization", {
  failure: UnauthorizedTransport,
  security: {
    apiKey: HttpApiSecurity.apiKey({ in: "header", key: "x-api-key" }),
  },
}) {}

const digest = (value: string) => createHash("sha256").update(value).digest()
// Hashing both sides gives constant-time comparison without leaking length.
const safeEqual = (a: string, b: string) => timingSafeEqual(digest(a), digest(b))

export const AuthorizationLive = Layer.effect(
  Authorization,
  Effect.gen(function* () {
    const config = yield* AppConfig
    const expected = Redacted.value(config.serviceApiKey)
    return {
      apiKey: (key) =>
        safeEqual(Redacted.value(key), expected)
          ? Effect.void
          : Effect.fail(new Unauthorized({ message: "Invalid or missing x-api-key header" })),
    }
  })
)
