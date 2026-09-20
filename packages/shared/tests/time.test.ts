import { afterAll, describe, expect, test } from "bun:test"
import { getDateTime, getTimeAgo } from "../index"

const ZONES = ["UTC", "Asia/Tokyo", "America/Los_Angeles", "Pacific/Kiritimati", "Pacific/Pago_Pago"]
const originalTz = process.env.TZ

afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ
  else process.env.TZ = originalTz
})

/** Runs `fn` once per zone with the process timezone switched, returning the results by zone. */
function inEachZone<T>(fn: () => T): Record<string, T> {
  const out: Record<string, T> = {}
  for (const zone of ZONES) {
    process.env.TZ = zone
    out[zone] = fn()
  }
  return out
}

const ago = (from: string, to: string) => () => getTimeAgo(new Date(from), new Date(to), "en-GB")

describe("getTimeAgo is the same in every timezone", () => {
  const cases: [string, string, string, string][] = [
    ["across a month boundary is hours, not a month", "2026-01-31T23:00:00Z", "2026-02-01T01:00:00Z", "2 hours ago"],
    ["across a year boundary is hours, not a year", "2025-12-31T23:30:00Z", "2026-01-01T00:30:00Z", "1 hour ago"],
    ["across a US DST change is elapsed time", "2026-03-08T08:00:00Z", "2026-03-08T12:00:00Z", "4 hours ago"],
    ["a few seconds", "2026-09-20T12:00:00Z", "2026-09-20T12:00:05Z", "5 seconds ago"],
    ["a couple of days", "2026-09-18T12:00:00Z", "2026-09-20T13:00:00Z", "2 days ago"],
    ["two months", "2026-07-01T00:00:00Z", "2026-09-01T00:00:00Z", "2 months ago"],
    ["two years", "2024-09-20T00:00:00Z", "2026-09-21T00:00:00Z", "2 years ago"]
  ]
  for (const [name, from, to, expected] of cases) {
    test(name, () => {
      const results = inEachZone(ago(from, to))
      for (const zone of ZONES) expect(results[zone]).toBe(expected)
    })
  }
})

describe("getDateTime shows the viewer's own local time for one instant", () => {
  const instant = new Date("2026-09-20T00:30:00Z")
  const show = () => getDateTime(instant, "short", "en-GB")

  test("differs per zone, follows each zone's offset", () => {
    const results = inEachZone(show)
    expect(results.UTC).toBe("20/09/2026, 00:30")
    expect(results["Asia/Tokyo"]).toBe("20/09/2026, 09:30")
    expect(results["America/Los_Angeles"]).toBe("19/09/2026, 17:30")
    expect(results["Pacific/Kiritimati"]).toBe("20/09/2026, 14:30")
    expect(results["Pacific/Pago_Pago"]).toBe("19/09/2026, 13:30")
  })

  test("all zones still point at the same instant", () => {
    // parse each rendering back with its own offset and compare against the source instant
    const offsets: Record<string, string> = {
      UTC: "+00:00",
      "Asia/Tokyo": "+09:00",
      "America/Los_Angeles": "-07:00",
      "Pacific/Kiritimati": "+14:00",
      "Pacific/Pago_Pago": "-11:00"
    }
    const results = inEachZone(show)
    for (const zone of ZONES) {
      const [date, time] = results[zone]!.split(", ") as [string, string]
      const [d, m, y] = date.split("/")
      expect(new Date(`${y}-${m}-${d}T${time}:00${offsets[zone]}`).getTime()).toBe(instant.getTime())
    }
  })
})
