import { afterAll, describe, expect, test } from "bun:test"
import { periodDay, periodEnd, periodStart } from "./period"

const ZONES = ["UTC", "Asia/Tokyo", "America/Los_Angeles", "Pacific/Kiritimati", "Pacific/Pago_Pago"]
const originalTz = process.env.TZ

afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ
  else process.env.TZ = originalTz
})

describe("period filter bounds", () => {
  for (const zone of ZONES) {
    test(`a picked day reads back unchanged in ${zone}`, () => {
      process.env.TZ = zone
      expect(periodDay(periodStart("2026-09-20"))).toBe("2026-09-20")
      expect(periodDay(periodEnd("2026-09-20"))).toBe("2026-09-20")
    })

    test(`the same day is the same UTC range in ${zone}`, () => {
      process.env.TZ = zone
      expect(periodStart("2026-09-20").toISOString()).toBe("2026-09-20T00:00:00.000Z")
      expect(periodEnd("2026-09-20").toISOString()).toBe("2026-09-20T23:59:59.999Z")
    })
  }

  test("the end bound keeps the last millisecond of the day", () => {
    expect(periodEnd("2026-09-20").getTime() + 1).toBe(periodStart("2026-09-21").getTime())
  })

  test("an unset bound shows nothing", () => {
    expect(periodDay(undefined)).toBeUndefined()
  })
})
