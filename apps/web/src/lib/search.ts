// Route `validateSearch` helpers: plain functions keep zod out of the entry bundle, since route options load up front

/** A search param as a string, or undefined when it's missing or not a string. */
export const searchString = (value: unknown) => (typeof value === "string" ? value : undefined)
