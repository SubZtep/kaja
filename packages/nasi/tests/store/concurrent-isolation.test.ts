import { expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Nasi } from "../../src/nasi"

function toolCallClient(reply: string, delayBeforeMs: number, toolCall?: { name: string; args: unknown }) {
  let round = 0
  return {
    chat: {
      completions: {
        stream: () => {
          const thisRound = round++
          return {
            async *[Symbol.asyncIterator]() {
              if (thisRound === 0 && toolCall) await new Promise(r => setTimeout(r, delayBeforeMs))
            },
            finalChatCompletion: async () => {
              if (thisRound === 0 && toolCall) {
                return {
                  choices: [
                    {
                      message: {
                        role: "assistant",
                        content: null,
                        tool_calls: [
                          {
                            id: "call_1",
                            type: "function",
                            function: { name: toolCall.name, arguments: JSON.stringify(toolCall.args) }
                          }
                        ]
                      }
                    }
                  ]
                }
              }
              return { choices: [{ message: { role: "assistant", content: reply } }] }
            }
          }
        }
      }
    }
  } as never
}

test("concurrent turns from different users do not cross-write to each other's sqlite file", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nasi-isolation-"))
  const dbA = join(dir, "userA.sqlite")
  const dbB = join(dir, "userB.sqlite")

  // User A's turn calls remember_note but is slow to finish that round (simulates an in-flight
  // model round-trip). User B's turn is fast and completes while A's tool call is still pending —
  // this interleaving is what used to flip the process-wide active store path out from under A.
  const nasiA = await Nasi.open({
    dbPath: dbA,
    profile: "hosted",
    chat: {
      client: toolCallClient("A-done", 50, {
        name: "remember_note",
        args: { key: "k", content: "A-secret", importance: "high" }
      }),
      model: "m"
    }
  })
  const nasiB = await Nasi.open({
    dbPath: dbB,
    profile: "hosted",
    chat: { client: toolCallClient("B-done", 0), model: "m" }
  })

  await Promise.all([nasiA.turnBuffered({ message: "remember this" }), nasiB.turnBuffered({ message: "hi from B" })])

  const { Database } = await import("bun:sqlite")
  const a = new Database(dbA, { readonly: true })
  const b = new Database(dbB, { readonly: true })
  const noteInA = a.query("SELECT key FROM notes WHERE key = 'k'").get()
  const noteInB = b.query("SELECT key FROM notes WHERE key = 'k'").get()
  a.close()
  b.close()

  expect(noteInA).not.toBeNull()
  expect(noteInB).toBeNull()
})
