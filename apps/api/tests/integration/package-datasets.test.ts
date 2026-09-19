import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { faker } from "@faker-js/faker"
import { app } from "../../src/app"
import { pool } from "../../src/core/db"
import { setNasiChatResolver } from "../../src/features/nasi/chat"
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

type Sent = { messages: { role: string; content?: unknown }[] }

/** Chat client that plays `script` (one assistant message per model call) and records what each call was sent. */
function scriptedChat(script: { content: string | null; tool_calls?: unknown[] }[], sent: Sent[]) {
  let i = 0
  return {
    chat: {
      completions: {
        stream: (params: never) => {
          sent.push(structuredClone(params))
          const message = script[i++] ?? { content: "done" }
          return {
            async *[Symbol.asyncIterator]() {
              if (message.content) yield { choices: [{ delta: { content: message.content } }] }
            },
            finalChatCompletion: async () => ({ choices: [{ message: { role: "assistant", ...message } }] })
          }
        }
      }
    }
  }
}

describe("datasets in the cloud", () => {
  let base: string
  let token: string
  const auth = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" })
  const turn = (message: string) =>
    app.request("/nasi/turn", { method: "POST", headers: auth(), body: JSON.stringify({ message }) })
  const systemPrompt = (sent: Sent) => String(sent.messages[0]!.content)

  beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), "kaja-package-datasets-test-"))
    token = await signUpAndSignIn(
      faker.internet.email().toLowerCase(),
      faker.internet.password({ length: 8, prefix: "P4$s" }),
      "Datasets"
    )
  })

  afterAll(async () => {
    setNasiChatResolver(undefined)
    await pool.query("DELETE FROM package WHERE name LIKE $1", [`%-${tag}`])
    // The sync below marked the real marketplace's packages removed; forget the stored commit so the next real sync re-applies it.
    await pool.query("DELETE FROM marketplace_sync")
    rmSync(base, { recursive: true, force: true })
  })

  test("a sync adds datasets by their marketplace path, skipping broken ones, and the catalog never lists them", async () => {
    const result = await marketplaceService.syncFromDir(marketplace(base), "d1")
    expect(result.added).toContain(`datasets/${topic}`)
    expect(result.added.join()).not.toContain(`broken-${tag}`)
    const { packages } = await (await app.request("/packages")).json()
    expect(packages.map((pkg: { type: string }) => pkg.type)).not.toContain("dataset")
    expect((await app.request(`/packages/me/dataset/${topic}`, { method: "PUT", headers: auth() })).status).toBe(400)
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
    const client = scriptedChat(
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
