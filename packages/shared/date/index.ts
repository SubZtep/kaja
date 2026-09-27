/** Calculates the relative time interval from elapsed time only, so it reads the same in every timezone. */
export function getTimeAgo(time: Date, now = new Date(), locale?: Intl.LocalesArgument) {
  let value
  const diff = (now.getTime() - time.getTime()) / 1000
  const seconds = Math.floor(diff)
  const minutes = Math.floor(diff / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  const months = Math.floor(days / 30)
  const years = Math.floor(days / 365)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })

  if (years > 0) {
    value = rtf.format(0 - years, "year")
  } else if (months > 0) {
    value = rtf.format(0 - months, "month")
  } else if (days > 0) {
    value = rtf.format(0 - days, "day")
  } else if (hours > 0) {
    value = rtf.format(0 - hours, "hour")
  } else if (minutes > 0) {
    value = rtf.format(0 - minutes, "minute")
  } else {
    value = rtf.format(0 - seconds, "second")
  }
  return value
}

export function getDateTime(time: Date, style: "short" | "full" | "long" | "medium", locale?: Intl.LocalesArgument) {
  return new Intl.DateTimeFormat(locale, { dateStyle: style, timeStyle: style }).format(time)
}
