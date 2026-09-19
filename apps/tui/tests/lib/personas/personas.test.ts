import { afterEach, expect, test } from "bun:test"
import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadPersonas } from "../../../lib/personas/personas"

// getConfigDir() reads XDG_CONFIG_HOME fresh on every call, so setting it per-test isolates each test from the real ~/.config/kaja — same pattern as tests/lib/personas/datasets.test.ts.
// The fixture's packages.toml enables unknown-model, barkochba, broken and a missing one; unlisted.toml isn't enabled.
const fixtureConfigDir = join(import.meta.dir, "../../fixtures/personas")
const emptyConfigDir = join(tmpdir(), `kaja-test-personas-empty-${Date.now()}`)
process.env.NODE_ENV = "test"

afterEach(async () => {
  delete process.env.XDG_CONFIG_HOME
  await rm(emptyConfigDir, { recursive: true, force: true })
})

test("loads default first, then the personas packages.toml enables, by id", async () => {
  process.env.XDG_CONFIG_HOME = fixtureConfigDir
  const personas = await loadPersonas()
  expect(personas.map(p => p.id)).toEqual(["default", "barkochba", "unknown-model"])
  expect(personas.find(p => p.id === "barkochba")?.label).toBe("Barkochba guesser")
})

test("a marketplace default.toml replaces the built-in default", async () => {
  process.env.XDG_CONFIG_HOME = fixtureConfigDir
  const [first] = await loadPersonas()
  expect(first).toMatchObject({ id: "default", label: "Your own default" })
})

test("skips broken, missing and unlisted persona files, without throwing", async () => {
  process.env.XDG_CONFIG_HOME = fixtureConfigDir
  const ids = (await loadPersonas()).map(p => p.id)
  expect(ids).not.toContain("broken")
  expect(ids).not.toContain("missing")
  expect(ids).not.toContain("unlisted")
})

test("a persona naming a model id not present in models.toml still loads (soft fallback at resolution time)", async () => {
  process.env.XDG_CONFIG_HOME = fixtureConfigDir
  const personas = await loadPersonas()
  const persona = personas.find(p => p.id === "unknown-model")
  expect(persona).toBeDefined()
  expect(persona?.models?.chat).toBe("does-not-exist")
})

test("a fresh install has only the built-in default, and writes nothing", async () => {
  process.env.XDG_CONFIG_HOME = emptyConfigDir
  const personas = await loadPersonas()
  expect(personas.map(p => p.id)).toEqual(["default"])
  expect(personas[0]?.label).toBe("Helpful assistant")
  expect(await Bun.file(join(emptyConfigDir, "kaja", "marketplace", "personas", "default.toml")).exists()).toBe(false)
})
