import { afterEach, expect, spyOn, test } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-abilities-file`

const { createFolderAbilityStore, loadAbilities } = await import("@kaja/nasi")
const { getConfigDir } = await import("../../../lib/config/config")
const { getMarketplaceDir, marketplaceSettings, ownAbilities, DEFAULT_SOURCE } = await import(
  "../../../lib/abilities/abilities-file"
)

afterEach(() => {
  rmSync(getConfigDir(), { recursive: true, force: true })
})

function put(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

test("the marketplace source defaults to the Kaja repo and main, and settings.toml's [marketplace] overrides it", async () => {
  expect((await marketplaceSettings()).source).toEqual(DEFAULT_SOURCE)
  put(join(getConfigDir(), "settings.toml"), `[marketplace]\nref = "wip"\n`)
  expect((await marketplaceSettings()).source).toEqual({ url: DEFAULT_SOURCE.url, ref: "wip" })
})

test("startup's ability loading uses no network and no git", async () => {
  put(join(getMarketplaceDir(), "abilities/demo/SKILL.md"), "---\ndescription: Demo.\n---\nBody\n")
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((() => {
    throw new Error("network used")
  }) as unknown as typeof fetch)
  const spawnSpy = spyOn(Bun, "spawn").mockImplementation(() => {
    throw new Error("process spawned")
  })
  try {
    const loaded = await loadAbilities(createFolderAbilityStore({ root: getMarketplaceDir() }))
    expect(loaded.skills.map(s => s.name)).toEqual(["demo"])
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(spawnSpy).not.toHaveBeenCalled()
  } finally {
    fetchSpy.mockRestore()
    spawnSpy.mockRestore()
  }
})

test("your own abilities and personas are the ones the last sync didn't write", async () => {
  const root = getMarketplaceDir()
  put(join(root, "abilities/synced/SKILL.md"), "---\ndescription: Synced.\n---\nBody\n")
  put(join(root, "abilities/mine/SKILL.md"), "---\ndescription: Mine.\n---\nBody\n")
  put(
    join(root, "abilities/my-api/tool.toml"),
    'description = "x"\nbaseUrl = "https://a.test"\n[[tools]]\nname = "x"\ndescription = "x"\npath = "/"\n'
  )
  put(join(root, "personas/care.toml"), `label = "Care"\ninstructions = "Synced."\n`)
  put(join(root, "personas/so.toml"), `label = "Mine"\ninstructions = "Mine."\n`)
  put(
    join(root, ".sync-lock.json"),
    JSON.stringify({ files: { "abilities/synced/SKILL.md": "x", "personas/care.toml": "x" } })
  )
  expect(await ownAbilities()).toEqual({ abilities: ["mine", "my-api"], personas: ["so"] })
})

test("with no sync lock, everything on disk is your own", async () => {
  const root = getMarketplaceDir()
  put(join(root, "abilities/mine/SKILL.md"), "---\ndescription: Mine.\n---\nBody\n")
  put(join(root, "personas/so.toml"), `label = "Mine"\ninstructions = "Mine."\n`)
  expect(await ownAbilities()).toEqual({ abilities: ["mine"], personas: ["so"] })
})
