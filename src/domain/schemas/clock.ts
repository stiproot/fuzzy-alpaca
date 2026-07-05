import { Schema } from "effect"

export const Clock = Schema.Struct({
  timestamp: Schema.DateTimeUtc,
  isOpen: Schema.Boolean,
  nextOpen: Schema.DateTimeUtc,
  nextClose: Schema.DateTimeUtc,
})
export type Clock = typeof Clock.Type

export const ClockFromWire = Schema.Struct({
  timestamp: Schema.DateTimeUtc,
  isOpen: Schema.propertySignature(Schema.Boolean).pipe(Schema.fromKey("is_open")),
  nextOpen: Schema.propertySignature(Schema.DateTimeUtc).pipe(Schema.fromKey("next_open")),
  nextClose: Schema.propertySignature(Schema.DateTimeUtc).pipe(Schema.fromKey("next_close")),
})
