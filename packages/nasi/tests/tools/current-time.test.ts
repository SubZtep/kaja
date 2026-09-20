import { afterAll, afterEach, expect, setSystemTime, test } from "bun:test"
import { LOCAL_OWNER_CTX } from "../../src/agent/tools"
import { createMemoryStore } from "../../src/store"
import { currentTimeTool } from "../../src/tools/builtin/current-time"

const ctx = { ...LOCAL_OWNER_CTX, store: createMemoryStore() }
const now = (timezone?: string) => currentTimeTool.execute({ timezone }, ctx)
const originalTz = process.env.TZ

afterEach(() => setSystemTime())
afterAll(() => {
  if (originalTz === undefined) delete process.env.TZ
  else process.env.TZ = originalTz
})

test("shows the one instant as each zone's wall clock with its own offset", async () => {
  setSystemTime(new Date("2026-09-20T00:30:00Z"))
  expect(await now("UTC")).toBe("2026-09-20T00:30:00+00:00 (UTC)")
  expect(await now("Asia/Tokyo")).toBe("2026-09-20T09:30:00+09:00 (Asia/Tokyo)")
  expect(await now("America/Los_Angeles")).toBe("2026-09-19T17:30:00-07:00 (America/Los_Angeles)")
  expect(await now("Asia/Kolkata")).toBe("2026-09-20T06:00:00+05:30 (Asia/Kolkata)")
})

test("follows daylight saving: the same zone has a different offset in summer and winter", async () => {
  setSystemTime(new Date("2026-07-14T19:04:05Z"))
  expect(await now("America/New_York")).toBe("2026-07-14T15:04:05-04:00 (America/New_York)")
  setSystemTime(new Date("2026-01-14T20:04:05Z"))
  expect(await now("America/New_York")).toBe("2026-01-14T15:04:05-05:00 (America/New_York)")
})

test("every zone's reading parses back to the same instant", async () => {
  const instant = new Date("2026-09-20T00:30:00Z")
  setSystemTime(instant)
  for (const zone of ["UTC", "Asia/Tokyo", "America/Los_Angeles", "Asia/Kolkata", "Pacific/Kiritimati"]) {
    const reading = ((await now(zone)) as string).split(" ")[0]!
    expect(new Date(reading).getTime()).toBe(instant.getTime())
  }
})

test("without a timezone it uses the machine's own", async () => {
  setSystemTime(new Date("2026-09-20T00:30:00Z"))
  process.env.TZ = "Asia/Tokyo"
  expect(await now()).toBe("2026-09-20T09:30:00+09:00 (Asia/Tokyo)")
  process.env.TZ = "America/Los_Angeles"
  expect(await now()).toBe("2026-09-19T17:30:00-07:00 (America/Los_Angeles)")
})

test("an unknown timezone is reported to the model instead of throwing", async () => {
  const result = (await now("Mars/Olympus")) as string
  expect(result).toContain("Mars/Olympus")
  expect(result).toContain("IANA")
})
