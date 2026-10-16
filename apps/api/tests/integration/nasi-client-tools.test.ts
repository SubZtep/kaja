import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { faker } from "@faker-js/faker"
import { app } from "../../src/app"
import { setNasiChatResolver } from "../../src/features/nasi/chat"
import { signUpAndSignIn } from "./helpers"

type Sent = {
  messages: { role: string; content?: unknown; tool_call_id?: string }[]
  tools?: { function: { name: string } }[]
}

/** A model that calls read_file first, then answers; `sent` records what every round was given. */
function scripted(sent: Sent[]) {
  let round = 0
  return {
    chat: {
      completions: {
        stream: (params: Sent) => {
          sent.push(structuredClone(params))
          const message =
            round++ % 2 === 0
              ? {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: `call_${round}`,
                      type: "function",
                      function: { name: "read_file", arguments: '{"path":"/etc/hostname"}' }
                    }
                  ]
                }
              : { role: "assistant", content: "Your host is kaja." }
          return {
            async *[Symbol.asyncIterator]() {},
            finalChatCompletion: async () => ({ choices: [{ message }] })
          }
        }
      }
    }
  }
}

const readFile = {
  name: "read_file",
  description: "Reads a file on the user's computer",
  parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] }
}

describe("a terminal's client tools", () => {
  let token: string
  const sent: Sent[] = []
  const turn = (path: string, body: object) =>
    app.request(path, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    })

  beforeAll(async () => {
    token = await signUpAndSignIn(
      faker.internet.email(),
      faker.internet.password({ length: 8, prefix: "P4$s" }),
      "Client"
    )
  })
  afterAll(() => setNasiChatResolver(undefined))

  test("a call to the user's computer pauses the turn; the results, an image too, resume it", async () => {
    const client = scripted(sent)
    setNasiChatResolver(async () => ({ client: client as never, model: "fake-model" }))
    const first = await turn("/nasi/turn", { message: "what's my hostname?", clientTools: [readFile] })
    expect(first.status).toBe(200)
    const paused = await first.json()
    expect(paused.status).toBe("needs_client_tool")
    const calls = paused.steps.find((step: { type: string }) => step.type === "client_tool_calls").calls
    expect(calls).toEqual([{ id: "call_1", name: "read_file", arguments: '{"path":"/etc/hostname"}' }])
    expect(sent[0]!.tools?.map(t => t.function.name)).toContain("read_file")

    // Over the 1 MB other routes allow: screenshots come back in these.
    const image = Buffer.alloc(1_200_000, 7).toString("base64")
    const second = await turn("/nasi/turn", {
      session: paused.session,
      clientTools: [readFile],
      toolResults: [{ id: "call_1", text: "kaja", images: [{ data: image, mimeType: "image/png" }] }]
    })
    expect(second.status).toBe(200)
    const done = await second.json()
    expect(done.status).toBe("completed")
    expect(done.message).toBe("Your host is kaja.")
    const resumed = sent.at(-1)!.messages
    expect(resumed.find(m => m.tool_call_id === "call_1")?.content).toBe("kaja")
    expect(JSON.stringify(resumed.at(-1))).toContain("data:image/png;base64,")
  })

  test("the stream announces the calls, and the user's own persona leads the turn it's picked for", async () => {
    const client = scripted(sent)
    setNasiChatResolver(async () => ({ client: client as never, model: "fake-model" }))
    const res = await turn("/nasi/turn/stream", {
      message: "hi",
      personaId: "mine",
      clientTools: [readFile],
      clientPersonas: [{ id: "mine", label: "Mine", instructions: "You are the user's own persona." }]
    })
    const text = await res.text()
    expect(text).toContain("event: client_tool_calls")
    expect(text).toContain('"status":"needs_client_tool"')
    expect(String(sent.at(-1)!.messages[0]!.content)).toContain("You are the user's own persona.")
  })

  test("without declarations nothing changes: no client tools, and the cloud's own environment", async () => {
    const before = sent.length
    const client = scripted(sent)
    setNasiChatResolver(async () => ({ client: client as never, model: "fake-model" }))
    const res = await turn("/nasi/turn", { message: "hi" })
    expect(res.status).toBe(200)
    expect(sent[before]!.tools?.map(t => t.function.name) ?? []).not.toContain("read_file")
    expect(String(sent[before]!.messages[0]!.content)).toContain("You have no access to the user's machine")
  })
})
