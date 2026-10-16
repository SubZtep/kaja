import { afterEach, expect, test } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-computer`

const { getConfigDir, invalidateConfigCache } = await import("../../../lib/config/config")
const { getMarketplaceDir } = await import("../../../lib/abilities/abilities-file")
const { computerAbilities, openComputer } = await import("../../../lib/cloud/computer")

afterEach(() => {
  rmSync(getConfigDir(), { recursive: true, force: true })
  invalidateConfigCache()
})

function put(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

const stdio = (extra = "") => `description = "x"\ntransport = "stdio"\ncommand = "true"\ntools = ["t"]\n${extra}`

/** settings.toml with `hosts`, and a marketplace where everything but `own` came from a sync. */
function setUp(hosts: string) {
  put(join(getConfigDir(), "settings.toml"), `[preferences]\nlocale = "en-GB"\n\n[tools.hosts]\n${hosts}\n`)
  const root = getMarketplaceDir()
  put(join(root, "abilities/files/mcp.toml"), stdio("localOnly = true\n"))
  put(join(root, "abilities/browser/mcp.toml"), stdio())
  put(join(root, "abilities/clock/mcp.toml"), stdio())
  put(join(root, "abilities/own/SKILL.md"), "---\nname: own\ndescription: My notes\n---\nUse my notes.\n")
  const synced = ["abilities/files/mcp.toml", "abilities/browser/mcp.toml", "abilities/clock/mcp.toml"]
  put(join(root, ".sync-lock.json"), JSON.stringify({ files: Object.fromEntries(synced.map(path => [path, "x"])) }))
  invalidateConfigCache()
}

test("this computer runs your own abilities, local-only ones and the stdio ones set to computer; the rest stay in the cloud", async () => {
  setUp(`browser = "computer"\nclock = "sandbox"`)
  expect([...(await computerAbilities())].sort()).toEqual(["browser", "files", "own"])
})

test("it declares the file builtins and its abilities' skills; the shell only when settings.toml allows it", async () => {
  setUp("")
  const computer = await openComputer()
  try {
    const names = computer.tools.map(tool => tool.name)
    expect(names).toEqual(expect.arrayContaining(["read_file", "list_files", "view_image"]))
    expect(names).not.toContain("run_command")
    expect(computer.skills).toEqual([{ name: "own", description: "My notes", files: [] }])
    expect(
      (await computer.run({ id: "1", name: "load_skill", arguments: '{"name":"own"}' }, async () => true)).text
    ).toContain("Use my notes.")
    const missing = await computer.run({ id: "2", name: "load_skill", arguments: '{"name":"nope"}' }, async () => true)
    expect(missing.status).toBe("error")
    const unknown = await computer.run({ id: "3", name: "not_here", arguments: "{}" }, async () => true)
    expect(unknown.status).toBe("error")
  } finally {
    await computer.close()
  }
})

test("an opted-in shell runs safe commands straight away and asks first for the rest", async () => {
  setUp(`shell = "computer"`)
  const computer = await openComputer()
  const asked: string[] = []
  const decline = async (request: { kind: string; command?: string }) => {
    asked.push(request.command ?? "")
    return false
  }
  try {
    expect(computer.tools.map(tool => tool.name)).toContain("run_command")
    const safe = await computer.run({ id: "1", name: "run_command", arguments: '{"command":"pwd"}' }, decline)
    expect(safe.text).not.toContain("declined")
    expect(safe.status).toBeUndefined()
    expect(asked).toEqual([])
    const risky = await computer.run(
      { id: "2", name: "run_command", arguments: '{"command":"rm -rf /tmp/x"}' },
      decline
    )
    expect(risky).toMatchObject({ text: "User declined to run this command.", status: "declined" })
    expect(asked).toEqual(["rm -rf /tmp/x"])
  } finally {
    await computer.close()
  }
})
