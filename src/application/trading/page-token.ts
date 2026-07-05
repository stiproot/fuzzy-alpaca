import { Effect } from "effect"
import { ValidationError } from "../../domain/errors.js"

// Opaque cursor for order-list pagination. Alpaca's orders endpoint has no
// native page tokens (it bounds by after/until timestamps), so the token
// encodes the boundary createdAt of the last item plus the direction it was
// produced under.
export interface OrdersPageCursor {
  readonly boundary: string
  readonly direction: "asc" | "desc"
}

export const encodeOrdersPageToken = (cursor: OrdersPageCursor): string =>
  Buffer.from(JSON.stringify({ b: cursor.boundary, d: cursor.direction })).toString("base64url")

export const decodeOrdersPageToken = (
  token: string
): Effect.Effect<OrdersPageCursor, ValidationError> =>
  Effect.try({
    try: () => {
      const parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"))
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        typeof parsed.b !== "string" ||
        (parsed.d !== "asc" && parsed.d !== "desc")
      ) {
        throw new Error("bad shape")
      }
      return { boundary: parsed.b, direction: parsed.d } as OrdersPageCursor
    },
    catch: () => new ValidationError({ message: "pageToken is not a valid cursor" }),
  })
