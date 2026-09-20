/** Start of a `YYYY-MM-DD` calendar day picked in a date input, as a UTC instant (timestamps are stored in UTC). */
export function periodStart(day: string) {
  return new Date(`${day}T00:00:00.000Z`)
}

/** Last millisecond of a `YYYY-MM-DD` calendar day picked in a date input, as a UTC instant. */
export function periodEnd(day: string) {
  return new Date(`${day}T23:59:59.999Z`)
}

/** The `YYYY-MM-DD` a date input shows for a period bound, or undefined when the bound is not set. */
export function periodDay(bound: Date | undefined) {
  return bound instanceof Date ? bound.toISOString().slice(0, 10) : undefined
}
