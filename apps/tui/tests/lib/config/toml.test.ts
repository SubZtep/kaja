import { afterEach, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { appendTomlSection } from "../../../lib/config/toml"

const path = join(tmpdir(), "kaja-test-append-section.toml")

afterEach(async () => {
  const { $ } = await import("bun")
  await $`rm -f ${path}`.quiet().nothrow()
})

const TEMPLATE = `# External service config — keep this comment.

[api]
baseUrl = "https://api.kaja.io"

# [telegram]
# allowedUserIds = [123]
`

test("appends the table and keeps every comment", async () => {
  await Bun.write(path, TEMPLATE)
  expect(await appendTomlSection(path, "telegram", ["allowedUserIds = [42]"])).toBe(true)

  const out = await Bun.file(path).text()
  expect(out).toContain("# External service config — keep this comment.")
  expect(out).toContain('baseUrl = "https://api.kaja.io"')
  expect(out.trimEnd().endsWith("[telegram]\nallowedUserIds = [42]")).toBe(true)
  // The commented-out example is left as a comment, so it doesn't become a duplicate table.
  expect(Bun.TOML.parse(out)).toMatchObject({ telegram: { allowedUserIds: [42] } })
})

test("a table that already exists is never overwritten", async () => {
  const existing = "[telegram]\nallowedUserIds = [7]\n"
  await Bun.write(path, existing)
  expect(await appendTomlSection(path, "telegram", ["allowedUserIds = [42]"])).toBe(false)
  expect(await Bun.file(path).text()).toBe(existing)
})

test("writes the table alone when the file is missing or empty", async () => {
  expect(await appendTomlSection(path, "stt", ['speachesUrl = "http://localhost:8000"'])).toBe(true)
  expect(await Bun.file(path).text()).toBe('[stt]\nspeachesUrl = "http://localhost:8000"\n')
})

test("an unparseable file is left alone rather than appended to", async () => {
  const broken = "this is not = = toml [[["
  await Bun.write(path, broken)
  expect(await appendTomlSection(path, "stt", ["x = 1"])).toBe(false)
  expect(await Bun.file(path).text()).toBe(broken)
})
