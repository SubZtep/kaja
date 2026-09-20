import { afterEach, expect, spyOn, test } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-abilities-file`

const { createFolderAbilityStore, loadAbilities } = await import("@kaja/nasi")
const { getConfigDir } = await import("../../../lib/config/config")
const { getMarketplaceDir, getAbilitiesPath, loadAbilitiesFile, resolveSource, saveAbilitiesFile, DEFAULT_SOURCE } =
  await import("../../../lib/abilities/abilities-file")

afterEach(() => {
  rmSync(getConfigDir(), { recursive: true, force: true })
})

function put(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

test("a missing abilities.toml enables nothing and isn't created", async () => {
  expect(await loadAbilitiesFile()).toEqual({ skills: [], tools: [], mcp: [], personas: [] })
  expect(await Bun.file(getAbilitiesPath()).exists()).toBe(false)
})

test("saving keeps [source] and keys this version doesn't know", async () => {
  put(getAbilitiesPath(), `future = true\nskills = ["old"]\n\n[source]\nurl = "/src/kaja"\nref = "wip"\n`)
  await saveAbilitiesFile({ skills: ["a", "b"] })
  const saved = Bun.TOML.parse(await Bun.file(getAbilitiesPath()).text())
  expect(saved).toEqual({ future: true, skills: ["a", "b"], source: { url: "/src/kaja", ref: "wip" } })
})

test("resolveSource fills in the Kaja repo and main", () => {
  expect(resolveSource(undefined)).toEqual(DEFAULT_SOURCE)
  expect(resolveSource({ ref: "wip" })).toEqual({ url: DEFAULT_SOURCE.url, ref: "wip" })
})

test("startup's ability loading uses no network and no git", async () => {
  put(getAbilitiesPath(), `skills = ["demo"]\n`)
  put(join(getMarketplaceDir(), "skills/demo/SKILL.md"), "---\nname: demo\ndescription: Demo.\n---\nBody\n")
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((() => {
    throw new Error("network used")
  }) as unknown as typeof fetch)
  const spawnSpy = spyOn(Bun, "spawn").mockImplementation(() => {
    throw new Error("process spawned")
  })
  try {
    const { skills } = await loadAbilitiesFile()
    const loaded = await loadAbilities(createFolderAbilityStore({ root: getMarketplaceDir(), enabled: { skills } }))
    expect(loaded.skills.map(s => s.name)).toEqual(["demo"])
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(spawnSpy).not.toHaveBeenCalled()
  } finally {
    fetchSpy.mockRestore()
    spawnSpy.mockRestore()
  }
})
