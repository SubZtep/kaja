import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { faker } from "@faker-js/faker"
import { app } from "../../src/app"
import { pool } from "../../src/core/db"
import { setNasiChatResolver } from "../../src/features/nasi/chat"
import { marketplaceService } from "../../src/services"
import { cleanupModel, seedModel, signUpAndSignIn } from "./helpers"

// Unique per run, so the assertions only look at this file's rows even on a shared dev database.
const tag = faker.string.alphanumeric(6).toLowerCase()
const care = `care-${tag}`
const quiz = `quiz-${tag}`
const FIXTURE_DEFAULT = `Fixture default ${tag}`

/** A marketplace folder with its own default, two personas (minus any in `leave`) and a broken one. */
function marketplace(base: string, leave: string[] = []) {
  const root = mkdtempSync(join(base, "mp-"))
  const put = (rel: string, content: string) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), content)
  }
  put("personas/default.toml", `label = "${FIXTURE_DEFAULT}"\n`)
  if (!leave.includes(care))
    put(`personas/${care}.toml`, `label = "Care"\nwhen = "the user is sad"\ninstructions = "Be kind."\n`)
  put(`personas/${quiz}.toml`, `label = "Quiz"\n`)
  put(`personas/broken-${tag}.toml`, `when = "no label"\n`)
  return root
}

/** Chat client that answers "ok" and records what each call was sent. */
function recordingChat(sent: { messages: { role: string; content?: unknown }[] }[]) {
  return {
    chat: {
      completions: {
        stream: (params: never) => {
          sent.push(structuredClone(params))
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

describe("personas in the cloud", () => {
  let base: string
  let token: string
  let providerId: string
  const auth = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" })
  const toggle = (method: "PUT" | "DELETE", name: string) =>
    app.request(`/abilities/me/persona/${name}`, { method, headers: auth() })
  const roster = async () =>
    ((await (await app.request("/nasi/info", { headers: auth() })).json()).personas as { id: string }[]).map(p => p.id)

  beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), "kaja-ability-personas-test-"))
    token = await signUpAndSignIn(
      faker.internet.email().toLowerCase(),
      faker.internet.password({ length: 8, prefix: "P4$s" }),
      "Personas"
    )
    ;({ providerId } = await seedModel("personas-test"))
  })

  afterAll(async () => {
    setNasiChatResolver(undefined)
    await cleanupModel(providerId)
    await pool.query("DELETE FROM ability WHERE name LIKE $1", [`%-${tag}`])
    await pool.query("DELETE FROM ability WHERE type = 'persona' AND name = 'default' AND description = $1", [
      FIXTURE_DEFAULT
    ])
    // The sync below marked the real marketplace's abilities removed; forget the stored commit so the next real sync re-applies it.
    await pool.query("DELETE FROM marketplace_sync")
    rmSync(base, { recursive: true, force: true })
  })

  test("a sync adds personas by their marketplace path, skipping broken ones", async () => {
    const result = await marketplaceService.syncFromDir(marketplace(base), "p1")
    expect(result.added).toEqual(expect.arrayContaining([`personas/${care}`, `personas/${quiz}`]))
    expect([...result.added, ...result.updated]).toContain("personas/default")
    expect(result.added.join()).not.toContain(`broken-${tag}`)
  })

  test("the catalog shows who each persona is, and leaves out default, which is always on", async () => {
    const { abilities } = await (await app.request("/abilities")).json()
    const personas = abilities.filter((ability: { type: string }) => ability.type === "persona")
    expect(personas.find((ability: { name: string }) => ability.name === care)).toMatchObject({
      description: "Care",
      persona: { label: "Care", when: "the user is sad", instructions: "Be kind." }
    })
    expect(personas.map((ability: { name: string }) => ability.name)).not.toContain("default")
  })

  test("default can't be turned on or off; an unknown persona is a 404", async () => {
    expect((await toggle("PUT", "default")).status).toBe(400)
    expect((await toggle("DELETE", "default")).status).toBe(400)
    expect((await toggle("PUT", `nope-${tag}`)).status).toBe(404)
  })

  test("a user's roster is default first (the synced one), then the personas they turned on", async () => {
    expect(await roster()).toEqual(["default"])
    expect((await toggle("PUT", care)).status).toBe(200)
    expect(await roster()).toEqual(["default", care])

    const { personas } = await (await app.request("/nasi/personas", { headers: auth() })).json()
    expect(personas[0]).toEqual({ id: "default", label: FIXTURE_DEFAULT })
    expect(personas.map((p: { id: string }) => p.id)).toEqual(expect.arrayContaining([care, quiz]))
  })

  test("a turn's system prompt lists the user's roster", async () => {
    const sent: { messages: { role: string; content?: unknown }[] }[] = []
    const client = recordingChat(sent)
    setNasiChatResolver(async () => ({ client: client as never, model: "fake-model" }))
    const res = await app.request("/nasi/turn", {
      method: "POST",
      headers: auth(),
      body: JSON.stringify({ message: "hi" })
    })
    expect(res.status).toBe(200)
    const system = String(sent[0]!.messages[0]!.content)
    expect(system).toContain("## Personas")
    expect(system).toContain(`- ${care} (Care): use when the user is sad`)
    expect(system).not.toContain(quiz)
  })

  test("a persona that left the marketplace shows as unavailable and leaves the roster", async () => {
    await marketplaceService.syncFromDir(marketplace(base, [care]), "p2")
    const { abilities } = await (await app.request("/abilities/me", { headers: auth() })).json()
    expect(abilities.find((ability: { name: string }) => ability.name === care)).toMatchObject({ available: false })
    expect(await roster()).toEqual(["default"])
  })
})
