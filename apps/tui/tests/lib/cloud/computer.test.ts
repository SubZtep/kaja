import { afterEach, expect, test } from "bun:test"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { NasiToolResultSchema, TOOL_RESULT_IMAGE_BASE64_MAX, TOOL_RESULT_TEXT_MAX } from "@kaja/schema/nasi"
import { png, TINY_PNG_BASE64 } from "../../fixtures/images"

process.env.XDG_CONFIG_HOME = `${tmpdir()}/kaja-test-xdg-config-computer`

const { getConfigDir, invalidateConfigCache } = await import("../../../lib/config/config")
const { getMarketplaceDir } = await import("../../../lib/abilities/abilities-file")
const { clampResult, computerAbilities, openComputer } = await import("../../../lib/cloud/computer")

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

test("results stay within the turn's limits: long text is cut, images are made model-sized, a non-image is a note", async () => {
  setUp("")
  const work = join(tmpdir(), "kaja-test-computer-work")
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  put(join(work, "big.log"), "x".repeat(300_000))
  writeFileSync(join(work, "photo.png"), await png(3000, 2000))
  put(join(work, "notes.png"), "not an image at all")
  const cwd = process.cwd()
  process.chdir(work)
  const computer = await openComputer()
  const run = (id: string, name: string, path: string) =>
    computer.run({ id, name, arguments: JSON.stringify({ path }) }, async () => true)
  try {
    const long = await run("1", "read_file", "big.log")
    expect(long.text.length).toBeLessThanOrEqual(TOOL_RESULT_TEXT_MAX)
    expect(long.text).toEndWith("[cut: 300000 characters in total]")
    expect(NasiToolResultSchema.safeParse(long).success).toBe(true)

    const photo = await run("2", "view_image", "photo.png")
    expect(photo.images).toHaveLength(1)
    expect(photo.images![0]!.mimeType).toBe("image/png")
    const { width } = await new Bun.Image(Buffer.from(photo.images![0]!.data, "base64")).metadata()
    expect(width).toBe(1568)
    expect(NasiToolResultSchema.safeParse(photo).success).toBe(true)

    const notImage = await run("3", "view_image", "notes.png")
    expect(notImage.images).toBeUndefined()
    expect(notImage.text).toContain("not an image")
  } finally {
    process.chdir(cwd)
    await computer.close()
    rmSync(work, { recursive: true, force: true })
  }
})

test("a result with too many or too big images keeps what fits and says what it left out", async () => {
  const small = { data: TINY_PNG_BASE64, mimeType: "image/png" }
  const huge = { data: "A".repeat(TOOL_RESULT_IMAGE_BASE64_MAX + 4), mimeType: "image/png" }
  const clamped = await clampResult({
    id: "1",
    text: "y".repeat(TOOL_RESULT_TEXT_MAX),
    images: [huge, ...Array(5).fill(small)]
  })
  expect(clamped.images).toHaveLength(4)
  expect(clamped.text.length).toBeLessThanOrEqual(TOOL_RESULT_TEXT_MAX)
  expect(clamped.text).toEndWith("(2 images not shown: too large to send; only 4 images go with one result)")
  expect(NasiToolResultSchema.safeParse(clamped).success).toBe(true)
})

test("view_image asks before sending an image from outside the folder Kaja runs in", async () => {
  setUp("")
  const outside = join(tmpdir(), "kaja-test-computer-outside")
  mkdirSync(outside, { recursive: true })
  writeFileSync(join(outside, "photo.png"), await png(8, 8))
  const computer = await openComputer()
  const asked: string[] = []
  try {
    const declined = await computer.run(
      { id: "1", name: "view_image", arguments: JSON.stringify({ path: join(outside, "photo.png") }) },
      async request => {
        asked.push(request.kind === "tool" ? request.summary : request.command)
        return false
      }
    )
    expect(declined).toMatchObject({ text: "User declined this request.", status: "declined" })
    expect(asked).toEqual([`View ${join(outside, "photo.png")} (outside the folder Kaja runs in)`])
  } finally {
    await computer.close()
    rmSync(outside, { recursive: true, force: true })
  }
})
