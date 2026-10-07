import { afterEach, expect, test } from "bun:test"
import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadPersonas } from "../../../lib/personas/personas"

// getConfigDir() reads XDG_CONFIG_HOME fresh on every call, so setting it per-test isolates each test from the real ~/.config/kaja — same pattern as tests/lib/personas/datasets.test.ts.
// Every persona file in the fixture's marketplace loads; its .sync-lock.json records all but own.toml, which is therefore yours.
const fixtureConfigDir = join(import.meta.dir, "../../fixtures/personas")
const emptyConfigDir = join(tmpdir(), `kaja-test-personas-empty-${Date.now()}`)
process.env.NODE_ENV = "test"

afterEach(async () => {
  delete process.env.XDG_CONFIG_HOME
  await rm(emptyConfigDir, { recursive: true, force: true })
})

test("loads default first, then every other persona in the marketplace folder, by id", async () => {
  process.env.XDG_CONFIG_HOME = fixtureConfigDir
  const personas = await loadPersonas()
  expect(personas.map(p => p.id)).toEqual(["default", "barkochba", "own", "unknown-model"])
  expect(personas.find(p => p.id === "barkochba")?.label).toBe("Barkochba guesser")
})

test("your own persona (one the sync didn't write) is marked local", async () => {
  process.env.XDG_CONFIG_HOME = fixtureConfigDir
  const personas = await loadPersonas()
  expect(personas.find(p => p.id === "own")).toMatchObject({ label: "Your own persona", local: true })
  expect(personas.filter(p => p.local).map(p => p.id)).toEqual(["own"])
})

test("a marketplace default.toml replaces the built-in default", async () => {
  process.env.XDG_CONFIG_HOME = fixtureConfigDir
  const [first] = await loadPersonas()
  expect(first).toMatchObject({ id: "default", label: "Your own default" })
})

test("skips a broken persona file, without throwing", async () => {
  process.env.XDG_CONFIG_HOME = fixtureConfigDir
  expect((await loadPersonas()).map(p => p.id)).not.toContain("broken")
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
