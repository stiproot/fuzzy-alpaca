import {
  AlpacaRateLimited,
  AlpacaUnavailable,
  InsufficientBuyingPower,
  InternalError,
  PdtRuleViolation,
  ValidationError,
  type AlpacaError,
} from "../../../domain/errors.js"

export type MappedAlpacaError = AlpacaError | InsufficientBuyingPower | PdtRuleViolation

export const isBusinessError = (
  e: MappedAlpacaError
): e is InsufficientBuyingPower | PdtRuleViolation =>
  e._tag === "InsufficientBuyingPower" || e._tag === "PdtRuleViolation"

interface AxiosishError {
  readonly message?: string
  readonly response?: {
    readonly status?: number
    readonly headers?: Record<string, string | undefined>
    readonly data?: { readonly code?: number; readonly message?: string } | string
  }
}

const dataOf = (err: AxiosishError): { code?: number; message?: string } =>
  typeof err.response?.data === "object" && err.response.data !== null ? err.response.data : {}

export const statusOf = (thrown: unknown): number | undefined =>
  ((thrown ?? {}) as AxiosishError).response?.status

export const dataMessageOf = (thrown: unknown): string | undefined =>
  dataOf((thrown ?? {}) as AxiosishError).message

// Alpaca error code for "subscription does not permit querying recent SIP data"
const SIP_SUBSCRIPTION_CODE = 40010001

// Translate whatever the SDK throws (axios errors, plain Errors) into the
// closed domain error set, per the verified Alpaca error shapes.
export const mapSdkError =
  (op: string) =>
  (thrown: unknown): MappedAlpacaError => {
    const err = (thrown ?? {}) as AxiosishError
    const status = err.response?.status
    const data = dataOf(err)
    const message = data.message ?? err.message ?? `Alpaca call ${op} failed`

    if (status === undefined) {
      return new AlpacaUnavailable({ message: `Alpaca unreachable during ${op}: ${message}` })
    }
    if (status === 429) {
      const retryAfterRaw = err.response?.headers?.["retry-after"]
      const retryAfterSeconds = retryAfterRaw !== undefined ? Number(retryAfterRaw) : NaN
      return new AlpacaRateLimited({
        message: `Alpaca rate limit hit during ${op}`,
        ...(Number.isFinite(retryAfterSeconds) ? { retryAfterSeconds } : {}),
      })
    }
    if (status >= 500) {
      return new AlpacaUnavailable({ message: `Alpaca ${status} during ${op}: ${message}` })
    }
    if (data.code === SIP_SUBSCRIPTION_CODE) {
      return new ValidationError({
        message: `Market data subscription does not permit SIP data (requested during ${op}); use feed=iex`,
        details: { alpacaCode: data.code },
      })
    }
    if (status === 403) {
      if (/buying power/i.test(message)) {
        return new InsufficientBuyingPower({
          message,
          ...(data.code !== undefined ? { alpacaCode: data.code } : {}),
        })
      }
      if (/pattern day trad/i.test(message)) {
        return new PdtRuleViolation({
          message,
          ...(data.code !== undefined ? { alpacaCode: data.code } : {}),
        })
      }
      return new InternalError({ message: `Alpaca rejected ${op} (403): ${message}` })
    }
    if (status === 401) {
      return new InternalError({
        message: `Alpaca rejected credentials during ${op} — check APCA_API_KEY_ID/APCA_API_SECRET_KEY`,
      })
    }
    // 422 and remaining 4xx: request was structurally wrong for Alpaca.
    // Not-found refinement (OrderNotFound/PositionNotFound) happens per-method.
    return new ValidationError({
      message: `Alpaca rejected ${op} (${status}): ${message}`,
      ...(data.code !== undefined ? { details: { alpacaCode: data.code } } : {}),
    })
  }
