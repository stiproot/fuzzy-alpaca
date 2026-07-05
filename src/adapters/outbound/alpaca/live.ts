import AlpacaModule from "@alpacahq/alpaca-trade-api"
import { Duration, Effect, Layer, ParseResult, Redacted, Schedule, Schema } from "effect"
import { AppConfig } from "../../../config.js"
import {
  AlpacaContractError,
  AlpacaTimeout,
  isRetryableAlpacaError,
  type AlpacaError,
} from "../../../domain/errors.js"
import { AccountFromWire } from "../../../domain/schemas/account.js"
import { ClockFromWire } from "../../../domain/schemas/clock.js"
import { AlpacaClient } from "../../../ports/broker.js"
import { isBusinessError, mapSdkError, type MappedAlpacaError } from "./errors-map.js"

// The only SDK surface we consume; responses are re-decoded through our own
// schemas, so the SDK's loose types stop here.
interface AlpacaSdk {
  getAccount(): Promise<unknown>
  getClock(): Promise<unknown>
}
type AlpacaCtor = new (config: {
  keyId: string
  secretKey: string
  paper: boolean
  feed: string
}) => AlpacaSdk

// CJS/ESM interop: under Node ESM the class arrives on the namespace default.
const Alpaca: AlpacaCtor =
  (AlpacaModule as unknown as { default?: AlpacaCtor }).default ??
  (AlpacaModule as unknown as AlpacaCtor)

// Retryable transport errors only; business 4xx and contract drift never retry.
// 3 attempts max keeps us inside Alpaca's ~200 req/min budget.
const retrySchedule = Schedule.exponential("200 millis", 2).pipe(
  Schedule.intersect(Schedule.recurs(3)),
  Schedule.jittered
)

const isRetryable = (e: MappedAlpacaError): boolean =>
  !isBusinessError(e) && isRetryableAlpacaError(e)

// On 429, wait at least Retry-After before the schedule's backoff resumes.
const pauseForRetryAfter = (e: MappedAlpacaError) =>
  e._tag === "AlpacaRateLimited" && e.retryAfterSeconds !== undefined
    ? Effect.sleep(Duration.seconds(e.retryAfterSeconds))
    : Effect.void

// The one recipe every Alpaca call goes through:
// tryPromise → decode (contract enforced) → timeout → retry → span.
// Exported for direct testing of the resilience pipeline.
export const alpacaCall = <A, I, R>(
  op: string,
  thunk: () => Promise<unknown>,
  schema: Schema.Schema<A, I, R>
): Effect.Effect<A, AlpacaError, R> =>
  Effect.tryPromise({ try: thunk, catch: mapSdkError(op) }).pipe(
    Effect.flatMap((raw) =>
      Schema.decodeUnknown(schema)(raw).pipe(
        Effect.mapError(
          (parseError) =>
            new AlpacaContractError({
              message: `Alpaca response for ${op} did not match the expected contract`,
              op,
              parseError: ParseResult.TreeFormatter.formatErrorSync(parseError),
            })
        )
      )
    ),
    Effect.timeoutFail({
      duration: "10 seconds",
      onTimeout: () => new AlpacaTimeout({ message: `Alpaca call ${op} timed out`, op }),
    }),
    Effect.tapError(pauseForRetryAfter),
    Effect.retry({ schedule: retrySchedule, while: isRetryable }),
    // Business errors can only arise from order mutations; on read paths they
    // are contract violations, so surface them as defects, not typed failures.
    Effect.catchIf(isBusinessError, (e) => Effect.die(e)),
    Effect.withSpan(`alpaca.${op}`)
  )

export const AlpacaClientLive = Layer.effect(
  AlpacaClient,
  Effect.gen(function* () {
    const config = yield* AppConfig
    const sdk = new Alpaca({
      keyId: Redacted.value(config.alpacaKeyId),
      secretKey: Redacted.value(config.alpacaSecretKey),
      paper: config.tradingMode === "paper",
      feed: config.feed,
    })
    return {
      getAccount: () => alpacaCall("getAccount", () => sdk.getAccount(), AccountFromWire),
      getClock: () => alpacaCall("getClock", () => sdk.getClock(), ClockFromWire),
    }
  })
)
