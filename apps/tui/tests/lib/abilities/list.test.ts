import { afterEach, expect, test } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { stripVTControlCharacters } from "node:util"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-ability-list`

const { getConfigDir } = await import("../../../lib/config/config")
const { getMarketplaceDir } = await import("../../../lib/abilities/abilities-file")
const { abilityListLines } = await import("../../../lib/abilities/list")

afterEach(() => rmSync(getConfigDir(), { recursive: true, force: true }))

function put(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

const plain = (lines: string[]) => stripVTControlCharacters(lines.join("\n"))

test("one table row per ability, its server's runner or host, and broken parts under the table", async () => {
  const root = getMarketplaceDir()
  put(join(root, "abilities/notes/SKILL.md"), "---\nname: notes\ndescription: Notes\n---\nBody\n")
  put(
    join(root, "abilities/remote/mcp.toml"),
    `description = "Remote"\ntransport = "http"\nurl = "https://mcp.example.com/mcp"\ntools = ["t"]\n`
  )
  put(join(root, "abilities/broken/tool.toml"), `description = "Broken"\n`)
  const text = plain(await abilityListLines(root, 100))
  expect(text).toMatch(/│ Ability\s+│ Parts\s+│ Runs\s+│ Key\s+│ Personas\s+│/)
  expect(text).toMatch(/│ notes local\s+│ skill\s+│/)
  expect(text).toMatch(/│ remote local\s+│ mcp\s+│ mcp\.example\.com\s+│/)
  expect(text).toContain("✗ broken: tool:")
})
