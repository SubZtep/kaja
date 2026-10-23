import { expect, test } from "bun:test"
import { formatBytes, formatImageReport } from "../../../lib/image/report"

test("sizes read in binary units, with a decimal from a megabyte up", () => {
  expect(formatBytes(512)).toBe("512 B")
  expect(formatBytes(2048)).toBe("2 KB")
  expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB")
})

test("the report has the totals, the sites and the sessions holding the most", () => {
  const text = formatImageReport({
    count: 3,
    bytes: 3072,
    described: 1,
    undescribed: 2,
    added: { days: 30, count: 2, bytes: 2048 },
    sites: [
      { host: "example.com", images: 2 },
      { host: "a.test", images: 1 }
    ],
    sessions: [{ id: "s1", title: "Trip", images: 3, bytes: 3072 }]
  })
  expect(text).toContain("3 images, 3 KB")
  expect(text).toContain("1 described, 2 without a description")
  expect(text).toContain("2 added in the last 30 days (2 KB)")
  expect(text).toContain("  example.com  2")
  expect(text).toContain("  s1  3 images, 3 KB  Trip")
  expect(text).toContain("kaja --local images describe")
})

test("an empty store says so", () => {
  expect(formatImageReport({ count: 0, bytes: 0, described: 0, undescribed: 0, sites: [], sessions: [] })).toBe(
    "No images stored yet."
  )
})
