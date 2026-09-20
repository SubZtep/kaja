import { expect, test } from "bun:test"
import { joinConversation, splitConversation } from "../../src/store/rows"

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
