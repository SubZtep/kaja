import { expect, test } from "bun:test"
import { Nasi, type NasiOpenOptions } from "../src/nasi"
import { createMemoryStore } from "../src/store"

function fakeClient(script: { content: string | null; tool_calls?: unknown[] }[]) {
  let i = 0
  return {
    chat: {
      completions: {
        stream: () => {
          const message = script[i++]
          if (!message) throw new Error("script exhausted")
          return {
            async *[Symbol.asyncIterator]() {
              if (message.content) yield { choices: [{ delta: { content: message.content } }] }
            },
            finalChatCompletion: async () => ({
              choices: [{ message: { role: "assistant", ...message } }]
            })
          }
        }
      }
    }
  }
}

function open(script: { content: string | null; tool_calls?: unknown[] }[], extra?: Partial<NasiOpenOptions>) {
  return Nasi.open({
    store: extra?.store ?? createMemoryStore(),
    chat: { client: fakeClient(script) as never, model: "fake" },
    ...extra
  })
}

test("ask_user tool yields needs_input and the next message binds as a tool result", async () => {
  const nasi = await open([
    {
      content: null,
      tool_calls: [
        {
          id: "call_1",
          type: "function",
          function: { name: "ask_user", arguments: JSON.stringify({ question: "Favorite color?" }) }
        }
      ]
    },
    { content: "Noted, blue." }
  ])

  const first = await nasi.turnBuffered({ message: "hi" })
  expect(first.status).toBe("needs_input")
  expect(first.message).toBe("Favorite color?")
  expect(first.session).toBeTruthy()

  const second = await nasi.turnBuffered({ session: first.session, message: "blue" })
  expect(second.status).toBe("completed")
  expect(second.message).toBe("Noted, blue.")
})

test("plain question mark final is completed, not needs_input", async () => {
  const nasi = await open([{ content: "Is it alive?" }])
  const result = await nasi.turnBuffered({ message: "guess" })
  expect(result.status).toBe("completed")
  expect(result.message).toBe("Is it alive?")
})

test("leaked tool-call closing tags are stripped from the final message", async () => {
  const nasi = await open([{ content: "It's a cat! Want to go another round? </parameter> </invoke> </invoke>" }])
  const result = await nasi.turnBuffered({ message: "yes" })
  expect(result.status).toBe("completed")
  expect(result.message).toBe("It's a cat! Want to go another round?")
})

test("turn() streams delta events live and returns the same response turnBuffered would", async () => {
  const nasi = await open([{ content: "streamed reply" }])

  const seen: string[] = []
  const gen = nasi.turn({ message: "hi" })
  let next = await gen.next()
  while (!next.done) {
    seen.push(next.value.type)
    next = await gen.next()
  }

  expect(seen).toContain("delta")
  expect(seen).toContain("final")
  expect(next.value.status).toBe("completed")
  expect(next.value.message).toBe("streamed reply")
  expect(next.value.session).toBeTruthy()
})

test("turn() isolates concurrent streamed turns from different users' stores", async () => {
  const nasiA = await open([{ content: "A-reply" }])
  const nasiB = await open([{ content: "B-reply" }])

  async function drain(gen: AsyncGenerator<unknown, { message: string }, void>) {
    let next = await gen.next()
    while (!next.done) next = await gen.next()
    return next.value
  }

  const [resultA, resultB] = await Promise.all([
    drain(nasiA.turn({ message: "hi" })),
    drain(nasiB.turn({ message: "hi" }))
  ])
  expect(resultA.message).toBe("A-reply")
  expect(resultB.message).toBe("B-reply")
})

test("an empty round is retried with a nudge instead of surfacing a blank final message", async () => {
  const nasi = await open([{ content: null }, { content: "Is it alive?" }])
  const result = await nasi.turnBuffered({ message: "guess" })
  expect(result.status).toBe("completed")
  expect(result.message).toBe("Is it alive?")
})

test("a fallback message is shown, never a blank reply, after exhausting retries", async () => {
  const nasi = await open(Array(6).fill({ content: null }))
  const result = await nasi.turnBuffered({ message: "guess" })
  expect(result.status).toBe("completed")
  expect(result.message).not.toBe("")
  expect(result.message.length).toBeGreaterThan(0)
})

test("a session id cannot be resumed by a different owner sharing the same store", async () => {
  const store = createMemoryStore()
  const nasiOwnerA = await open([{ content: "reply for A" }], { store, owner: "widget:key1:visitorA" })
  const first = await nasiOwnerA.turnBuffered({ message: "hi" })
  expect(first.status).toBe("completed")

  const nasiOwnerB = await open([{ content: "should not be reached" }], { store, owner: "widget:key1:visitorB" })
  await expect(nasiOwnerB.turnBuffered({ session: first.session, message: "hijack attempt" })).rejects.toThrow()
})
