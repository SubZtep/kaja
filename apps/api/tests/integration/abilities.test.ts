import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { faker } from "@faker-js/faker"
import { app } from "../../src/app"
import { pool } from "../../src/core/db"
import { setNasiChatResolver } from "../../src/features/nasi/chat"
import { createPostgresAbilityStore } from "../../src/features/nasi/pg-abilities"
import { marketplaceService } from "../../src/services"
import { MarketplaceService } from "../../src/services/marketplace"
import { cleanupModel, seedModel, signUpAndSignIn } from "./helpers"

// Unique per run, so the assertions only look at this file's rows even on a shared dev database.
const tag = faker.string.alphanumeric(6).toLowerCase()
const plain = `plain-${tag}`
const scripted = `scripted-${tag}`
const quiet = `quiet-${tag}`

let base: string

function put(root: string, rel: string, content: string) {
  const path = join(root, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function skill(root: string, name: string, body = `Use ${name}.`) {
  put(root, `abilities/${name}/SKILL.md`, `---\ndescription: The ${name} skill.\n---\n${body}\n`)
}

/** A marketplace folder holding exactly `names` (the scripted one gets a script). */
function marketplace(names: string[], body?: string) {
  const root = mkdtempSync(join(base, "mp-"))
  for (const name of names) skill(root, name, body)
  if (names.includes(scripted)) put(root, `abilities/${scripted}/scripts/run.sh`, "echo hi")
  if (names.includes(plain)) put(root, `abilities/${plain}/reference.md`, "the reference")
  // Personas fix what a turn may use; the default one here uses every skill in the folder, quiet none.
  put(root, "personas/default.toml", `label = "Default"\nabilities = ${JSON.stringify(names)}\n`)
  put(root, `personas/${quiet}.toml`, `label = "Quiet"\n`)
  return root
}

/** Chat client that records what each model call was sent, then answers with a fixed reply. */
function capturingChatClient(calls: { tools: { function: { name: string } }[]; messages: { content: string }[] }[]) {
  return {
    chat: {
      completions: {
        stream: (params: never) => {
          calls.push(params)
          return {
            async *[Symbol.asyncIterator]() {
              yield { choices: [{ delta: { content: "ok" } }] }
            },
            finalChatCompletion: async () => ({ choices: [{ message: { role: "assistant", content: "ok" } }] })
          }
        }
      }
    }
  }
}

/** The skills a user's cloud turn can load. */
const servedSkills = async () =>
  (await createPostgresAbilityStore({ userId: "any" }).listSkills()).map(skill => skill.name)

describe("abilities", () => {
  let token: string
  const auth = () => ({ Authorization: `Bearer ${token}` })

  beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), "kaja-abilities-test-"))
    token = await signUpAndSignIn(
      faker.internet.email(),
      faker.internet.password({ length: 8, prefix: "P4$s" }),
      "Ability"
    )
  })

  afterAll(async () => {
    setNasiChatResolver(undefined)
    await pool.query("DELETE FROM ability WHERE name LIKE $1", [`%-${tag}`])
    // The fixture's default persona too, so later files get the built-in one again.
    await pool.query("DELETE FROM ability WHERE type = 'persona' AND name = 'default'")
    rmSync(base, { recursive: true, force: true })
  })

  test("a sync adds skills; turns never get ones with scripts", async () => {
    const result = await marketplaceService.syncFromDir(marketplace([plain, scripted]), "c1")
    expect(result.added.filter(name => !name.startsWith("personas/")).sort()).toEqual([plain, scripted].sort())
    const names = await servedSkills()
    expect(names).toContain(plain)
    expect(names).not.toContain(scripted)
  })

  test("/abilities/me needs sign-in, and the old catalog and toggles are gone", async () => {
    expect((await app.request("/abilities/me")).status).toBe(401)
    expect((await app.request("/abilities")).status).toBe(404)
    expect((await app.request(`/abilities/me/skill/${plain}`, { method: "PUT", headers: auth() })).status).toBe(404)
  })

  test("a skill removed upstream leaves turns, and comes back when restored", async () => {
    const gone = await marketplaceService.syncFromDir(marketplace([scripted]), "c2")
    expect(gone.removed).toContain(plain)
    expect(await servedSkills()).not.toContain(plain)

    const back = await marketplaceService.syncFromDir(marketplace([plain, scripted]), "c3")
    expect(back.updated).toContain(plain)
    expect(await servedSkills()).toContain(plain)
  })

  test("an unchanged skill isn't reported as updated; a changed one is", async () => {
    expect((await marketplaceService.syncFromDir(marketplace([plain, scripted]), "c4")).updated).not.toContain(plain)
    const changed = await marketplaceService.syncFromDir(marketplace([plain, scripted], "New body."), "c5")
    expect(changed.updated).toContain(plain)
  })

  test("the cloud store serves a skill's body and its other files, case-insensitively", async () => {
    const store = createPostgresAbilityStore({ skillsOnly: true })
    expect((await store.listSkills()).filter(s => s.name.endsWith(tag)).map(s => [s.name, s.files])).toEqual([
      [plain, ["reference.md"]]
    ])
    expect(await store.readSkill(plain)).toStartWith("New body.")
    expect(await store.readSkill(plain, "REFERENCE.md")).toBe("the reference")
    expect(await store.readSkill(plain, "../other.md")).toBeUndefined()
    expect(await store.readSkill(scripted)).toBeUndefined()
  })

  test("a cloud turn gets load_skill and the skills its persona lists; info lists load_skill", async () => {
    const calls: Parameters<typeof capturingChatClient>[0] = []
    setNasiChatResolver(async () => ({ client: capturingChatClient(calls) as never, model: "fake-model" }))

    const res = await app.request("/nasi/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...auth() },
      body: JSON.stringify({ message: "hi" })
    })
    expect(res.status).toBe(200)
    expect(calls[0]!.tools.map(t => t.function.name)).toContain("load_skill")
    expect(calls[0]!.messages[0]!.content).toContain(`- ${plain}: The ${plain} skill.`)

    // /nasi/info resolves a real model row, unlike turns (which use the chat resolver above).
    const { providerId } = await seedModel("abilities-info-test")
    try {
      const info = await (await app.request("/nasi/info", { headers: auth() })).json()
      expect(info.tools).toContain("load_skill")
    } finally {
      await cleanupModel(providerId)
    }
  })

  test("admin sync endpoints need the admin role", async () => {
    expect((await app.request("/admin/abilities/sync", { headers: auth() })).status).toBe(403)
    expect((await app.request("/admin/abilities/sync", { method: "POST", headers: auth() })).status).toBe(403)
  })

  test("a widget's visitors get the skills its persona lists", async () => {
    const origin = "https://ability-widget.test"
    const create = (config: object) =>
      app.request("/widget/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth() },
        body: JSON.stringify({ label: "w", allowedOrigins: [origin], config })
      })
    expect((await create({ persona: "nope-nope" })).status).toBe(400)
    const turnTools = async (rawKey: string) => {
      const calls: Parameters<typeof capturingChatClient>[0] = []
      setNasiChatResolver(async () => ({ client: capturingChatClient(calls) as never, model: "fake-model" }))
      const res = await app.request("/widget/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json", origin, "x-kaja-widget-key": rawKey },
        body: JSON.stringify({ message: "hi", visitorId: "v1" })
      })
      expect(res.status).toBe(200)
      return calls[0]!.tools.map(t => t.function.name)
    }
    const withDefault = (await (await create({})).json()).rawKey
    const withQuiet = (await (await create({ persona: quiet })).json()).rawKey
    expect(await turnTools(withDefault)).toContain("load_skill")
    expect(await turnTools(withQuiet)).not.toContain("load_skill")
  })
})

describe("marketplace sync from GitHub", () => {
  const sha = "a".repeat(40)
  const skillName = `tarball-${tag}`
  let tarball: Uint8Array<ArrayBuffer>
  let requests: string[]

  beforeAll(async () => {
    const root = mkdtempSync(join(tmpdir(), "kaja-tarball-"))
    put(
      join(root, `kaja-${sha}`),
      `marketplace/abilities/${skillName}/SKILL.md`,
      `---\ndescription: From a tarball.\n---\nBody\n`
    )
    put(join(root, `kaja-${sha}`), "apps/other.txt", "not part of the marketplace")
    const archive = join(root, "repo.tar.gz")
    const tar = Bun.spawnSync(["tar", "-czf", archive, "-C", root, `kaja-${sha}`])
    expect(tar.exitCode).toBe(0)
    tarball = new Uint8Array(await Bun.file(archive).arrayBuffer())
    rmSync(root, { recursive: true, force: true })
  })

  afterAll(async () => {
    await pool.query("DELETE FROM ability WHERE name = $1", [skillName])
    // These tests rewrote the table; forget the stored commit so the next real sync re-applies the marketplace instead of skipping it.
    await pool.query("DELETE FROM marketplace_sync")
  })

  const fakeGitHub = (commit = sha) =>
    (async (input: string | URL | Request) => {
      const url = String(input)
      requests.push(url)
      if (url.startsWith("https://api.github.com/repos/owner/repo/commits/main")) return new Response(commit)
      if (url === `https://codeload.github.com/owner/repo/tar.gz/${sha}`) return new Response(tarball)
      return new Response("not found", { status: 404 })
    }) as unknown as typeof fetch

  test("downloads and applies a new commit, then skips an unchanged one", async () => {
    requests = []
    const service = new MarketplaceService(pool, { repo: "owner/repo", ref: "main" }, fakeGitHub())
    const first = await service.sync({ force: true })
    expect(first).toMatchObject({ commit: sha, changed: true })
    expect(first.added).toContain(skillName)
    expect(await servedSkills()).toContain(skillName)

    requests = []
    const second = await service.sync()
    expect(second).toEqual({ commit: sha, changed: false, added: [], updated: [], removed: [] })
    expect(requests).toHaveLength(1)

    expect(await service.status()).toMatchObject({ commit: sha, error: null })
  })

  test("a failed fetch is recorded in the status and thrown", async () => {
    requests = []
    const service = new MarketplaceService(
      pool,
      { repo: "owner/repo", ref: "main" },
      (async () => new Response("rate limited", { status: 403 })) as unknown as typeof fetch
    )
    await expect(service.sync()).rejects.toThrow("HTTP 403")
    expect((await service.status()).error).toContain("HTTP 403")
  })
})
