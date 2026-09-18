import { afterEach, expect, spyOn, test } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-packages-file`

const { createFolderPackageStore, loadPackages } = await import("@kaja/nasi")
const { getConfigDir } = await import("../../../lib/config/config")
const { getMarketplaceDir, getPackagesPath, loadPackagesFile, resolveSource, savePackagesFile, DEFAULT_SOURCE } =
  await import("../../../lib/packages/packages-file")

afterEach(() => {
  rmSync(getConfigDir(), { recursive: true, force: true })
})

function put(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

test("a missing packages.toml enables nothing and isn't created", async () => {
  expect(await loadPackagesFile()).toEqual({ skills: [], tools: [], mcp: [] })
  expect(await Bun.file(getPackagesPath()).exists()).toBe(false)
})

test("saving keeps [source] and keys this version doesn't know", async () => {
  put(getPackagesPath(), `future = true\nskills = ["old"]\n\n[source]\nurl = "/src/kaja"\nref = "wip"\n`)
  await savePackagesFile({ skills: ["a", "b"] })
  const saved = Bun.TOML.parse(await Bun.file(getPackagesPath()).text())
  expect(saved).toEqual({ future: true, skills: ["a", "b"], source: { url: "/src/kaja", ref: "wip" } })
})

test("resolveSource fills in the Kaja repo and main", () => {
  expect(resolveSource(undefined)).toEqual(DEFAULT_SOURCE)
  expect(resolveSource({ ref: "wip" })).toEqual({ url: DEFAULT_SOURCE.url, ref: "wip" })
})

test("startup's package loading uses no network and no git", async () => {
  put(getPackagesPath(), `skills = ["demo"]\n`)
  put(join(getMarketplaceDir(), "skills/demo/SKILL.md"), "---\nname: demo\ndescription: Demo.\n---\nBody\n")
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation((() => {
    throw new Error("network used")
  }) as unknown as typeof fetch)
  const spawnSpy = spyOn(Bun, "spawn").mockImplementation(() => {
    throw new Error("process spawned")
  })
  try {
    const { skills } = await loadPackagesFile()
    const loaded = await loadPackages(createFolderPackageStore({ root: getMarketplaceDir(), enabled: { skills } }))
    expect(loaded.skills.map(s => s.name)).toEqual(["demo"])
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(spawnSpy).not.toHaveBeenCalled()
  } finally {
    fetchSpy.mockRestore()
    spawnSpy.mockRestore()
  }
})
