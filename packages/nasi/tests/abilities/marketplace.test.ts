import { expect, test } from "bun:test"
import { join } from "node:path"
import { readSkillBundle, scanHttpTools, scanMcpAbilities, scanSkills } from "../../src/abilities/folder-store"

// The repo's own marketplace/, as users and the cloud sync get it.
const marketplace = join(import.meta.dir, "../../../../marketplace")

test("every skill, HTTP tool and MCP server shipped in marketplace/ loads", async () => {
  const skills = await scanSkills(marketplace)
  expect(skills.length).toBeGreaterThan(0)
  for (const entry of [...skills, ...(await scanHttpTools(marketplace)), ...(await scanMcpAbilities(marketplace))]) {
    expect({ name: entry.name, error: entry.error }).toEqual({ name: entry.name, error: undefined })
  }
})

test("at least one shipped skill has no scripts, so the cloud catalog isn't empty", async () => {
  const bundles = await Promise.all(
    (await scanSkills(marketplace)).map(skill => readSkillBundle(marketplace, skill.name))
  )
  expect(bundles.filter(bundle => !bundle.hasScripts).map(bundle => bundle.name)).toContain("meeting-notes")
})

test("every shipped stdio package is pinned, so local and sandbox start the same build", async () => {
  const { parseMcpManifest } = await import("../../src/abilities/folder-store")
  const pinned = {
    npm: /@\d+\.\d+\.\d+[\w.+-]*$/,
    pypi: /@\d[\w.!+-]*$/,
    docker: /@sha256:[a-f0-9]{64}$|:(?!latest$)[\w.-]+$/
  }
  for (const entry of await scanMcpAbilities(marketplace)) {
    if (entry.transport !== "stdio") continue
    const text = await Bun.file(join(marketplace, "abilities", entry.name, "mcp.toml")).text()
    for (const [kind, spec] of Object.entries(parseMcpManifest(text, entry.name).package ?? {}))
      expect({ ability: entry.name, spec, pinned: pinned[kind as keyof typeof pinned].test(spec) }).toMatchObject({
        pinned: true
      })
  }
})
