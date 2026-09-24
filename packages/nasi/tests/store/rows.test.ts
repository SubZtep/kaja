import { expect, test } from "bun:test"
import {
  attachImages,
  clearTelemetry,
  detachImages,
  hasImageRefs,
  IMAGE_REF_PREFIX,
  joinConversation,
  splitConversation
} from "../../src/store/rows"

const call = (id: string, name: string) => ({ id, type: "function", function: { name, arguments: `{"a":"${name}"}` } })

const messages = [
  { role: "system", content: "be helpful" },
  { role: "user", content: "hi" },
  {
    role: "assistant",
    content: null,
    reasoning_content: "thinking",
    tool_calls: [call("c1", "read"), call("c2", "write")]
  },
  { role: "tool", tool_call_id: "c1", content: "ok" },
  { role: "tool", tool_call_id: "c2", content: "" },
  { role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }] },
  { role: "assistant", content: "done" }
]

test("a session survives split and join unchanged", () => {
  const session = { messages }
  expect(joinConversation(splitConversation(session)) as unknown).toEqual(session)
})

test("the system prompt lives beside the messages, not in them", () => {
  const rows = splitConversation({ messages })
  expect(rows.systemPrompt).toBe("be helpful")
  expect(rows.messages).toHaveLength(messages.length - 1)
  expect(rows.messages.some(row => row.role === "system")).toBe(false)
})

test("tool calls keep their order and belong to the assistant row", () => {
  const assistant = splitConversation({ messages }).messages[1]!
  expect(assistant.content).toBeNull()
  expect(assistant.reasoning).toBe("thinking")
  expect(assistant.toolCalls.map(c => [c.callId, c.name])).toEqual([
    ["c1", "read"],
    ["c2", "write"]
  ])
})

test("image parts go to `parts`, text to `content`", () => {
  const rows = splitConversation({ messages }).messages
  expect(rows[4]!.content).toBeNull()
  expect(rows[4]!.parts).toHaveLength(1)
  expect(rows[0]!.parts).toBeNull()
})

test("a session without a system message stays without one", () => {
  const session = { messages: messages.slice(1) }
  const rows = splitConversation(session)
  expect(rows.systemPrompt).toBeNull()
  expect(joinConversation(rows) as unknown).toEqual(session)
})

test.each([
  ["pendingAskUserId", "ask_user"],
  ["pendingRunCommandId", "run_command"],
  ["pendingClientToolCallId", "client_tool"],
  ["pendingToolApprovalId", "tool_approval"]
] as const)("%s round-trips as a %s pause", (field, kind) => {
  const session = { messages: messages.slice(0, 3), [field]: "c1" }
  const rows = splitConversation(session)
  expect(rows.pending).toEqual({ callId: "c1", kind })
  expect(joinConversation(rows) as unknown).toEqual(session)
})

test("no pending call leaves no pending field", () => {
  expect(splitConversation({ messages }).pending).toBeNull()
  expect(Object.keys(joinConversation(splitConversation({ messages })))).toEqual(["messages"])
})

test("telemetry lands on the rows it belongs to; the system prompt is not counted", () => {
  const rows = splitConversation({
    messages,
    telemetry: {
      steps: [
        { at: 1, model: "m", promptTokens: 5, latencyMs: 40 },
        { at: 5, latencyMs: 9 }
      ],
      calls: { c1: { status: "ok", durationMs: 3 } }
    }
  })
  expect(rows.messages[1]!.step).toEqual({ model: "m", promptTokens: 5, latencyMs: 40 })
  expect(rows.messages[5]!.step).toEqual({ latencyMs: 9 })
  expect(rows.messages[0]!.step).toBeUndefined()
  expect(rows.calls).toEqual([{ callId: "c1", status: "ok", durationMs: 3 }])
})

test("a session without telemetry has no calls, and clearing takes it off", () => {
  expect(splitConversation({ messages }).calls).toEqual([])
  const session = { messages, telemetry: { steps: [], calls: {} } }
  clearTelemetry(session)
  expect(session).not.toHaveProperty("telemetry")
})

test("inline images leave the parts as references, and come back from them", () => {
  const png = { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }
  const linked = { type: "image_url", image_url: { url: "https://example.com/a.png" } }
  const { parts, images } = detachImages([png, { type: "text", text: "hi" }, linked, png])
  expect(images).toHaveLength(2)
  expect(images[0]!.hash).toBe(images[1]!.hash)
  expect(images[0]!.mimeType).toBe("image/png")
  const ref = (parts![0] as typeof png).image_url.url
  expect(ref).toStartWith(IMAGE_REF_PREFIX)
  expect(parts![2]).toEqual(linked)
  expect(hasImageRefs(parts)).toBe(true)
  expect(hasImageRefs([linked])).toBe(false)

  const stored = new Map(images.map(image => [image.hash, image]))
  expect(attachImages(parts, stored)).toEqual([png, { type: "text", text: "hi" }, linked, png])
  expect(attachImages(parts, new Map())![0]).toEqual({ type: "text", text: "[an image that is no longer stored]" })
})
