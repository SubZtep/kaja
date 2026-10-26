import { afterEach, expect, test } from "bun:test"
import { realpathSync } from "node:fs"
import { join } from "node:path"
import { SCHEMA_BASE_URL, schemaRef, withSchemaLine } from "../../../src/lib/config/schema-file"

const repoSchemaDir = join(import.meta.dir, "../../../../../packages/schema/json")
const profile = Bun.env.KAJA_PROFILE

afterEach(() => {
  if (profile === undefined) delete Bun.env.KAJA_PROFILE
  else Bun.env.KAJA_PROFILE = profile
})

test("a config file points at the published schema on main", () => {
  delete Bun.env.KAJA_PROFILE
  expect(withSchemaLine("/x/settings.toml", "a = 1\n")).toBe(`#:schema ${SCHEMA_BASE_URL}/settings.json\n\na = 1\n`)
})

test("a backup validates like its file", () => {
  delete Bun.env.KAJA_PROFILE
  expect(withSchemaLine("/x/models.bak.2.toml", "")).toStartWith(`#:schema ${SCHEMA_BASE_URL}/models.json\n`)
})

test("an old schema line is replaced, not stacked", () => {
  delete Bun.env.KAJA_PROFILE
  const text = withSchemaLine("/x/hooks.toml", "#:schema ./schemas/hooks.json\n\na = 1\n")
  expect(text).toBe(`#:schema ${SCHEMA_BASE_URL}/hooks.json\n\na = 1\n`)
})

test("a file without a schema is left alone", () => {
  expect(withSchemaLine("/x/other.toml", "a = 1\n")).toBe("a = 1\n")
})

test("the dev profile points at the checkout's schema by its absolute path", () => {
  Bun.env.KAJA_PROFILE = "dev"
  expect(schemaRef("settings.json", repoSchemaDir)).toBe(realpathSync(join(repoSchemaDir, "settings.json")))
  expect(schemaRef("settings.json", "/nowhere")).toBe(`${SCHEMA_BASE_URL}/settings.json`)
})
