import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { faker } from "@faker-js/faker"
import { type ChatParams, scriptedChat, type ScriptedMessage } from "../../../../packages/nasi/tests/fixtures/chat"
import { app } from "../../src/app"
import { sql } from "../../src/core/db"
import { registerAbilityDatasets, setNasiChatResolver } from "../../src/features/nasi/chat"
import { marketplaceService } from "../../src/services"
import { signUpAndSignIn } from "./helpers"

// Unique per run, so the assertions only look at this file's rows even on a shared dev database.
const tag = faker.string.alphanumeric(6).toLowerCase()
const topic = `profile-${tag}`

/** A marketplace folder with a profile dataset and a broken one. */
function marketplace(base: string) {
  const root = mkdtempSync(join(base, "mp-"))
  const put = (rel: string, content: string) => {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), content)
  }
  put(
    `datasets/${topic}.json`,
    JSON.stringify({
      label: "Profile",
      profile: true,
      fields: [
        { name: "name", prompt: "What should I call you?" },
        { name: "pets", prompt: "Any pets?" }
      ]
    })
  )
  put(`datasets/broken-${tag}.json`, '{ "label": "No fields" }')
  return root
}

type Sent = ChatParams

/** Plays `script` (then "done"), recording what each model call was sent. */
const chatClient = (script: ScriptedMessage[], sent: Sent[]) =>
  scriptedChat(script, { onCall: params => sent.push(structuredClone(params)), fallback: { content: "done" } })

describe("datasets in the cloud", () => {
  let base: string
  let token: string
  let synced: Awaited<ReturnType<typeof marketplaceService.syncFromDir>>
  const auth = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" })
  const turn = (message: string) =>
    app.request("/nasi/turn", { method: "POST", headers: auth(), body: JSON.stringify({ message }) })
  const systemPrompt = (sent: Sent) => String(sent.messages[0]!.content)

  beforeAll(async () => {
    // The loaders are global: a run that also loads the TUI's tests would leave its own in place
    registerAbilityDatasets()
    base = mkdtempSync(join(tmpdir(), "kaja-ability-datasets-test-"))
    token = await signUpAndSignIn(faker.internet.email().toLowerCase(), "Datasets")
    // Here rather than in a test, so a single test can run on its own (an editor's "run test")
    synced = await marketplaceService.syncFromDir(marketplace(base), "d1")
  })

  afterAll(async () => {
    setNasiChatResolver(undefined)
    await sql`DELETE FROM ability WHERE name LIKE ${`%-${tag}`}`
    // The sync below marked the real marketplace's abilities removed; forget the stored commit so the next real sync re-applies it.
    await sql`DELETE FROM marketplace_sync`
    rmSync(base, { recursive: true, force: true })
  })

  test("a sync adds datasets by their marketplace path, skipping broken ones", async () => {
    expect(synced.added).toContain(`datasets/${topic}`)
    expect(synced.added.join()).not.toContain(`broken-${tag}`)
  })

  test("a cloud turn asks for the name while it's unknown, records it, and the next conversation knows it", async () => {
    const sent: Sent[] = []
    const answer = {
      id: "call_1",
      type: "function",
      function: {
        name: "dataset_info",
        arguments: JSON.stringify({ action: "answer", dataset: topic, field: "name", value: "Ada" })
      }
    }
    const client = chatClient(
      [{ content: null, tool_calls: [answer] }, { content: "Nice to meet you, Ada." }, { content: "Hi Ada!" }],
      sent
    )
    setNasiChatResolver(async () => ({ client: client as never, model: "fake-model" }))

    expect((await turn("hi, I'm Ada")).status).toBe(200)
    expect(systemPrompt(sent[0]!)).toContain('kindly ask once ("What should I call you?")')

    // A new conversation: the section now carries the name and no longer asks for it.
    expect((await turn("hello again")).status).toBe(200)
    const later = systemPrompt(sent.at(-1)!)
    expect(later).toContain("## About the user")
    expect(later).toContain("- name: Ada")
    expect(later).not.toContain("kindly ask")
  })
})
