import { describe, expect, it } from "vitest"
import { mapSdkError } from "../src/adapters/outbound/alpaca/errors-map.js"

const axiosish = (
  status: number | undefined,
  data?: { code?: number; message?: string },
  headers?: Record<string, string>
) => ({
  message: "Request failed",
  ...(status !== undefined ? { response: { status, data, headers } } : {}),
})

const map = mapSdkError("testOp")

// The documented error-shape table, row by row.
describe("mapSdkError", () => {
  it("network error without response → AlpacaUnavailable", () => {
    expect(map(new Error("ECONNREFUSED")). _tag).toBe("AlpacaUnavailable")
    expect(map(undefined)._tag).toBe("AlpacaUnavailable")
  })

  it("429 → AlpacaRateLimited capturing Retry-After", () => {
    const e = map(axiosish(429, undefined, { "retry-after": "7" }))
    expect(e._tag).toBe("AlpacaRateLimited")
    expect((e as any).retryAfterSeconds).toBe(7)
  })

  it("429 without Retry-After → AlpacaRateLimited, no retryAfterSeconds", () => {
    const e = map(axiosish(429))
    expect(e._tag).toBe("AlpacaRateLimited")
    expect((e as any).retryAfterSeconds).toBeUndefined()
  })

  it("5xx → AlpacaUnavailable", () => {
    expect(map(axiosish(502))._tag).toBe("AlpacaUnavailable")
    expect(map(axiosish(500, { code: 50010000, message: "internal" }))._tag).toBe("AlpacaUnavailable")
  })

  it("403 buying power → InsufficientBuyingPower", () => {
    const e = map(axiosish(403, { code: 40310000, message: "insufficient buying power" }))
    expect(e._tag).toBe("InsufficientBuyingPower")
    expect((e as any).alpacaCode).toBe(40310000)
  })

  it("403 PDT → PdtRuleViolation", () => {
    const e = map(axiosish(403, { message: "trade denied due to pattern day trading protection" }))
    expect(e._tag).toBe("PdtRuleViolation")
  })

  it("other 403 → InternalError", () => {
    expect(map(axiosish(403, { message: "forbidden" }))._tag).toBe("InternalError")
  })

  it("401 → InternalError pointing at credentials", () => {
    const e = map(axiosish(401, { code: 40110000, message: "unauthorized" }))
    expect(e._tag).toBe("InternalError")
    expect(e.message).toContain("APCA_API_KEY_ID")
  })

  it("SIP subscription code 40010001 → ValidationError with clear detail", () => {
    const e = map(axiosish(400, { code: 40010001, message: "subscription does not permit" }))
    expect(e._tag).toBe("ValidationError")
    expect(e.message).toContain("SIP")
  })

  it("422 → ValidationError with alpacaCode in details", () => {
    const e = map(axiosish(422, { code: 42210000, message: "cannot open a short sell" }))
    expect(e._tag).toBe("ValidationError")
    expect((e as any).details).toEqual({ alpacaCode: 42210000 })
  })
})
