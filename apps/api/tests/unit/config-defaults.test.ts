import { describe, expect, test } from "bun:test"
import { readdir } from "node:fs/promises"
import { join } from "node:path"
import { defaultTemplates } from "../../src/services/config-defaults"

const configDir = join(import.meta.dir, "../../../../config")
// The files in config/ that the API deliberately doesn't serve as templates.
const NOT_SERVED = new Set(["catalog.toml", "settings.toml", "secrets.toml"])

describe("config defaults", () => {
  test("every template file in config/ is served, and nothing else is", async () => {
    const files = (await readdir(configDir)).filter(name => name.endsWith(".toml") && !NOT_SERVED.has(name))
    expect([...defaultTemplates.keys()].sort()).toEqual(files.sort())
  })

  test("served templates match the files on disk", async () => {
    for (const [name, content] of defaultTemplates) expect(content).toBe(await Bun.file(join(configDir, name)).text())
  })
})
