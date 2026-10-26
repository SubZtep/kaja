import { expect, test } from "bun:test"
import { isNewer, latestVersion, manifestVersion } from "../../../src/lib/cli/update-check"

test("manifestVersion reads the TUI tag's version", () => {
  expect(manifestVersion({ version: "tui@0.30.6", base_url: "x" })).toBe("0.30.6")
  expect(manifestVersion({ version: "api@0.22.6" })).toBeNull()
  expect(manifestVersion({ version: 7 })).toBeNull()
  expect(manifestVersion(null)).toBeNull()
})

test("isNewer compares by semver, not as text", () => {
  expect(isNewer("0.30.10", "0.30.9")).toBe(true)
  expect(isNewer("0.30.6", "0.30.6")).toBe(false)
  expect(isNewer("0.29.9", "0.30.0")).toBe(false)
})

test("latestVersion is null when the manifest can't be had", async () => {
  const answer = (response: Response | Error) =>
    (async () => {
      if (response instanceof Error) throw response
      return response
    }) as unknown as typeof fetch

  expect(await latestVersion(answer(Response.json({ version: "tui@1.2.3" })))).toBe("1.2.3")
  expect(await latestVersion(answer(new Response("not found", { status: 404 })))).toBeNull()
  expect(await latestVersion(answer(new Response("<html>")))).toBeNull()
  expect(await latestVersion(answer(new Error("offline")))).toBeNull()
})
