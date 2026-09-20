import { afterEach, expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { appendTomlSection, setTomlValue, setTomlValueInText } from "../../../lib/config/toml"

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

const SETTINGS = `# Settings — keep this comment.

[stt]
speachesUrl = "ws://localhost:8000"  # old address
language = "en"

[tts]
voice = "af"

# [memory]
# dbPath = "x"
`

test("setTomlValueInText replaces a key that is there and keeps everything around it", () => {
  const out = setTomlValueInText(SETTINGS, "stt", "speachesUrl", '"ws://box:9000"')
  expect(out).toContain('[stt]\nspeachesUrl = "ws://box:9000"\nlanguage = "en"')
  expect(out).toContain("# Settings — keep this comment.")
  expect(out).toContain('[tts]\nvoice = "af"')
})

test("setTomlValueInText adds a missing key under its table, not another one", () => {
  const out = setTomlValueInText(SETTINGS, "tts", "speachesUrl", '"http://box:9000"')
  expect(out).toContain('[tts]\nspeachesUrl = "http://box:9000"\nvoice = "af"')
  expect(out).toContain('[stt]\nspeachesUrl = "ws://localhost:8000"')
})

test("setTomlValueInText appends the table when it is missing, and starts a file that is empty", () => {
  expect(setTomlValueInText(SETTINGS, "voice", "url", '"x"').trimEnd().endsWith('[voice]\nurl = "x"')).toBe(true)
  expect(setTomlValueInText("", "stt", "speachesUrl", '"ws://a"')).toBe('[stt]\nspeachesUrl = "ws://a"\n')
})

test("setTomlValue updates a table that already exists, which appendTomlSection would skip", async () => {
  await Bun.write(path, SETTINGS)
  await setTomlValue(path, "stt", "speachesUrl", '"ws://box:9000"')
  await setTomlValue(path, "stt", "speachesUrl", '"ws://box:9000"')
  const out = await Bun.file(path).text()
  // Twice over, still one table with the new value.
  expect(out.match(/\[stt\]/g)).toHaveLength(1)
  expect(out).toContain('speachesUrl = "ws://box:9000"')
  expect(out).not.toContain("old address")
})

test("setTomlValue leaves a file it cannot parse alone", async () => {
  await Bun.write(path, "[stt\nbroken")
  await setTomlValue(path, "stt", "speachesUrl", '"ws://a"')
  expect(await Bun.file(path).text()).toBe("[stt\nbroken")
})
