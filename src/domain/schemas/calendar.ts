import { Schema } from "effect"

// Trading-calendar day: date (YYYY-MM-DD), open/close (HH:MM local exchange time)
export const CalendarDay = Schema.Struct({
  date: Schema.String.pipe(Schema.pattern(/^\d{4}-\d{2}-\d{2}$/)),
  open: Schema.String.pipe(Schema.pattern(/^\d{2}:\d{2}$/)),
  close: Schema.String.pipe(Schema.pattern(/^\d{2}:\d{2}$/)),
})
export type CalendarDay = typeof CalendarDay.Type

export const CalendarQuery = Schema.Struct({
  /** YYYY-MM-DD */
  start: Schema.optional(Schema.String.pipe(Schema.pattern(/^\d{4}-\d{2}-\d{2}$/))),
  end: Schema.optional(Schema.String.pipe(Schema.pattern(/^\d{4}-\d{2}-\d{2}$/))),
})
export type CalendarQuery = typeof CalendarQuery.Type
