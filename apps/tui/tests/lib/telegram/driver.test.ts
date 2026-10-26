import { beforeEach, expect, test } from "bun:test"
import { mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Persona } from "@kaja/schema/cli"
import { APIError } from "openai"
import type { Agent, Tool } from "../../../src/lib/agent/agents"
import type { InlineKeyboardLike, TelegramSender } from "../../../src/lib/telegram/driver"
import { TINY_PNG, TINY_PNG_BASE64 } from "../../fixtures/images"

// Same isolation/dynamic-import discipline as tests/lib/agents.test.ts: env vars and a minimal settings.toml fixture must be in place before lib/agents.ts (transitively pulled in by lib/telegram-driver.ts) is ever evaluated, since lib/openai.ts reads config() at its own module top level.
const dataDir = `${tmpdir()}/kaja-test-xdg-data-telegram-driver`
const configDir = `${tmpdir()}/kaja-test-xdg-config-telegram-driver`
process.env.XDG_DATA_HOME = dataDir
process.env.XDG_CONFIG_HOME = configDir
process.env.NODE_ENV = "test"

const configKajaDir = join(configDir, "kaja")
mkdirSync(configKajaDir, { recursive: true })
writeFileSync(join(configKajaDir, "settings.toml"), "")
writeFileSync(
  join(configKajaDir, "models.toml"),
  `
[providers.default]
base_url = "http://localhost"
api_key = "x"

[models.chat]
model = "x"
tasks = ["chat"]
provider = "default"
`
)

const { invalidateConfigCache } = await import("../../../src/lib/config/config")
const { askUserTool, runCommandTool, switchPersonaTool, tool } = await import("../../../src/lib/agent/agents")
const { peekStore } = await import("../../../src/lib/memory/store")
const { createSessionRow, deleteSessionRow, listSessions, loadLatestSessionRowForOwner } =
  await import("../../../src/lib/session/store")
const { telegramOwner } = await import("@kaja/schema/store")
const { createTelegramDriver } = await import("../../../src/lib/telegram/driver")
const { t } = await import("../../../src/lib/i18n")
const { approvalToken } = await import("@kaja/shared/telegram")
const { notApprovedPrompt } = await import("@kaja/nasi")

beforeEach(async () => {
  process.env.XDG_DATA_HOME = dataDir
  process.env.XDG_CONFIG_HOME = configDir
  invalidateConfigCache()
  for (const session of await listSessions()) await deleteSessionRow(session.id)
})

type FakeMessage = {
  /** The provider refuses the request with this status instead of answering. */
  reject?: number
  /** The refusal's text (default: an image refusal). */
  rejectMessage?: string
  content: string | null
  tool_calls?: {
    id: string
    type: "function"
    function: { name: string; arguments: string }
  }[]
}

/** Every request the fake model got, as the messages it was sent. */
const requests: { role: string; content?: unknown }[][] = []

/** Mirrors tests/lib/agents.test.ts's fakeClient/fakeAgent exactly. */
function fakeClient(script: FakeMessage[]) {
  let i = 0
  return {
    chat: {
      completions: {
        stream: (params: { messages: { role: string; content?: unknown }[] }) => {
          requests.push(structuredClone(params.messages))
          const message = script[i++]
          if (!message) throw new Error("fake script exhausted")
          if (message.reject)
            throw APIError.generate(
              message.reject,
              { error: { message: message.rejectMessage ?? "image input unsupported" } },
              undefined,
              new Headers()
            )
          return {
            async *[Symbol.asyncIterator]() {
              if (message.content) yield { choices: [{ delta: { content: message.content } }] }
            },
            finalChatCompletion: async () => ({
              choices: [{ message: { role: "assistant", ...message } }]
            })
          }
        },
        // The summarizer, for /compact.
        create: async () => ({ choices: [{ message: { content: "SUMMARY" } }] })
      }
    }
  }
}

function fakeAgent(script: FakeMessage[], extraTools: Tool<never>[] = []): Agent {
  return {
    name: "Tester",
    model: "fake-model",
    tools: [askUserTool, runCommandTool, ...extraTools],
    client: fakeClient(script)
  } as unknown as Agent
}

const persona: Persona = { id: "kaja", label: "Kaja" }
const defaultPersona: Persona = { id: "default", label: "Helpful assistant" }

/** Records every call instead of hitting a network; messageIds increment from 1. */
function fakeSender() {
  let nextMessageId = 1
  const sent: {
    chatId: number
    text: string
    replyMarkup?: InlineKeyboardLike
  }[] = []
  const edited: {
    chatId: number
    messageId: number
    text: string
    replyMarkup?: InlineKeyboardLike
  }[] = []
  const answered: { callbackQueryId: string; text?: string }[] = []
  const deleted: number[] = []
  const photos: {
    chatId: number
    photo: { data: Uint8Array } | { path: string } | { url: string }
    caption?: string
  }[] = []
  const captions: { chatId: number; messageId: number; caption: string }[] = []
  const sender: TelegramSender = {
    async sendMessage(chatId, text, opts) {
      const messageId = nextMessageId++
      sent.push({ chatId, text, replyMarkup: opts?.replyMarkup })
      return { messageId }
    },
    async editMessageText(chatId, messageId, text, opts) {
      edited.push({ chatId, messageId, text, replyMarkup: opts?.replyMarkup })
    },
    async deleteMessage(_chatId, messageId) {
      deleted.push(messageId)
    },
    async answerCallbackQuery(callbackQueryId, opts) {
      answered.push({ callbackQueryId, text: opts?.text })
    },
    async sendPhoto(chatId, photo, opts) {
      photos.push({ chatId, photo, caption: opts?.caption })
      return { messageId: 100 + photos.length }
    },
    async editCaption(chatId, messageId, caption) {
      captions.push({ chatId, messageId, caption })
    }
  }
  return { sender, sent, edited, answered, deleted, photos, captions }
}

/** One driver, one scripted fake LLM conversation. */
function makeDriver(script: FakeMessage[], sender: TelegramSender, extraTools: Tool<never>[] = []) {
  return createTelegramDriver({
    agentConfig: { model: "fake-model", tools: [askUserTool, runCommandTool], store: peekStore() },
    personas: [persona],
    models: [],
    sender,
    createAgent: () => fakeAgent(script, extraTools)
  })
}

test("first message from a user creates a session and finalizes the reply", async () => {
  const { sender, sent, edited } = fakeSender()
  const driver = makeDriver([{ content: "Hello there." }], sender)

  await driver.handleMessage(42, 100, "hi")

  expect(sent).toHaveLength(1)
  expect(sent[0]!.text).toBe("…")
  expect(edited).toHaveLength(1)
  expect(edited[0]!.messageId).toBe(1)
  expect(edited[0]!.text).toBe("Hello there.")

  const saved = await loadLatestSessionRowForOwner(telegramOwner(42))
  expect(saved).toBeDefined()
  expect(saved!.owner).toBe(telegramOwner(42))
})

test("tool_image and display_image events are delivered as photos", async () => {
  const imageTool = tool<Record<string, never>>({
    name: "make_picture",
    description: "test tool that returns images",
    parameters: { type: "object", properties: {} },
    execute: async () => ({
      text: "made a picture",
      images: [{ data: TINY_PNG, mimeType: "image/png" }],
      displayImage: { url: "https://example.com/pic.png", alt: "a preview" }
    })
  })
  const { sender, photos, edited } = fakeSender()
  const driver = makeDriver(
    [
      {
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "make_picture", arguments: "{}" }
          }
        ]
      },
      { content: "Here is your picture." }
    ],
    sender,
    [imageTool]
  )

  await driver.handleMessage(42, 100, "draw me something")

  expect(photos).toHaveLength(2)
  expect(photos[0]!.photo).toEqual({ url: "https://example.com/pic.png" })
  expect(photos[0]!.caption).toBe("a preview")
  // The stored copy, read back from the session's store
  expect(photos[1]!.photo).toEqual({ data: new Uint8Array(TINY_PNG) })
  expect(edited.at(-1)!.text).toBe("Here is your picture.")
})

test("a reply's Markdown images follow its text as photos: public URLs and existing local image files only", async () => {
  const imagePath = join(tmpdir(), "kaja test telegram reply.png")
  writeFileSync(imagePath, "not-a-real-png")
  const reply = [
    "Here you go: ![A cat](https://example.com/cat.jpg)",
    `![Local](${encodeURI(imagePath)}) ![Missing](/nope/missing.png) ![Not an image](/etc/hostname)`,
    "![Private](http://127.0.0.1/x.png)"
  ].join("\n\n")
  const { sender, photos, edited } = fakeSender()
  const driver = makeDriver([{ content: reply }], sender)

  await driver.handleMessage(42, 100, "show me")

  expect(edited.at(-1)!.text).toStartWith("Here you go: A cat")
  expect(photos).toEqual([
    { chatId: 100, photo: { url: "https://example.com/cat.jpg" }, caption: "A cat" },
    { chatId: 100, photo: { path: imagePath }, caption: "Local" }
  ])
})

test("a reply that is only an image leaves a 📷 placeholder instead of an empty-response note", async () => {
  const { sender, photos, edited } = fakeSender()
  const driver = makeDriver([{ content: "![](https://example.com/cat.jpg)" }], sender)

  await driver.handleMessage(42, 100, "a cat please")

  expect(edited.at(-1)!.text).toBe("📷")
  expect(photos).toEqual([{ chatId: 100, photo: { url: "https://example.com/cat.jpg" }, caption: undefined }])
})

test("a photo reaches the model with its caption; a model that refuses it gets a plain note, and the photo is dropped", async () => {
  const photo = `data:image/png;base64,${TINY_PNG_BASE64}`
  const { sender, edited } = fakeSender()
  const driver = makeDriver([{ content: "A cat." }, { content: null, reject: 400 }, { content: "Sure." }], sender)

  requests.length = 0
  await driver.handleMessage(42, 100, "what is it?", [photo])
  expect(requests[0]!.at(-1)).toEqual({
    role: "user",
    content: [
      { type: "text", text: "what is it?" },
      { type: "text", text: "[Image (1×1): an image the user sent]" },
      { type: "image_url", image_url: { url: photo } }
    ]
  })
  expect(edited.at(-1)!.text).toBe("A cat.")

  // A caption that looks like a command is still just the photo's text
  await driver.handleMessage(42, 100, "/new", [photo])
  expect(edited.at(-1)!.text).toBe(t("telegram.noVision"))

  await driver.handleMessage(42, 100, "never mind")
  const images = requests[2]!
    .flatMap(m => (Array.isArray(m.content) ? (m.content as { type: string }[]) : []))
    .filter(p => p.type === "image_url")
  // Only the first photo, which the model did take, is still in the conversation
  expect(images).toHaveLength(1)
  expect(edited.at(-1)!.text).toBe("Sure.")
})

test("a failed turn names the error category in the bot's language, like the cloud bot does", async () => {
  const { sender, edited } = fakeSender()
  const driver = makeDriver([{ content: null, reject: 500 }], sender)
  await driver.handleMessage(42, 100, "hi")
  const labels = ["network", "tool", "agent", "unknown"].map(category => t(`error.${category}`))
  const line = edited.at(-1)!.text
  expect(labels.some(label => line.startsWith(`⚠ ${label}: `))).toBe(true)
})

test("resuming continues a pre-seeded session, scoped to that owner only", async () => {
  await createSessionRow({
    persona: "kaja",
    model: "fake-model",
    owner: telegramOwner(42),
    session: {
      messages: [
        { role: "system", content: "be helpful" },
        { role: "user", content: "earlier message" },
        { role: "assistant", content: "earlier reply" }
      ]
    },
    events: [
      { type: "user", text: "earlier message" },
      { type: "final", content: "earlier reply" }
    ],
    title: "earlier message"
  })

  const { sender, edited } = fakeSender()
  const driver = makeDriver([{ content: "continued reply" }], sender)
  await driver.handleMessage(42, 100, "follow up")
  expect(edited.at(-1)!.text).toBe("continued reply")

  // A different user's first message must not see user 42's history — with no pre-seeded row for user 43, this driver starts a fresh session for them regardless.
  const { sender: sender43, edited: edited43 } = fakeSender()
  const driver43 = makeDriver([{ content: "fresh reply" }], sender43)
  await driver43.handleMessage(43, 200, "hello")
  expect(edited43.at(-1)!.text).toBe("fresh reply")
})

test("/new bypasses a resumable session and starts a fresh one", async () => {
  await createSessionRow({
    persona: "kaja",
    model: "fake-model",
    owner: telegramOwner(42),
    session: {
      messages: [
        { role: "system", content: "be helpful" },
        { role: "user", content: "earlier message" },
        { role: "assistant", content: "earlier reply" }
      ]
    },
    events: [
      { type: "user", text: "earlier message" },
      { type: "final", content: "earlier reply" }
    ],
    title: "earlier message"
  })

  const { sender, sent, edited } = fakeSender()
  const driver = makeDriver([{ content: "fresh reply" }], sender)

  await driver.handleMessage(42, 100, "/new")
  expect(sent.at(-1)!.text).toBe(t("telegram.newSession"))

  await driver.handleMessage(42, 100, "hi again")
  expect(edited.at(-1)!.text).toBe("fresh reply")

  const saved = await loadLatestSessionRowForOwner(telegramOwner(42))
  expect(saved!.title).toBe("hi again")
})

test("/new re-resolves getInitialPersona live, picking up a persona switched after the driver was created", async () => {
  const kaja: Persona = { id: "kaja", label: "Kaja" }
  const grumpy: Persona = {
    id: "grumpy",
    label: "Grumpy",
    instructions: "Be grumpy."
  }
  let currentPersonaId = kaja.id

  const { sender } = fakeSender()
  const driver = createTelegramDriver({
    agentConfig: { model: "fake-model", tools: [askUserTool, runCommandTool], store: peekStore() },
    personas: [kaja, grumpy],
    models: [],
    sender,
    getInitialPersona: () => [kaja, grumpy].find(p => p.id === currentPersonaId),
    createAgent: () => fakeAgent([{ content: "reply" }, { content: "reply" }])
  })

  await driver.handleMessage(42, 100, "/new")
  await driver.handleMessage(42, 100, "hi")
  let saved = await loadLatestSessionRowForOwner(telegramOwner(42))
  expect(saved!.persona).toBe("kaja")

  // Switch persona "in the terminal" while this same driver keeps running — /new must re-call getInitialPersona rather than reuse whatever it resolved when the driver was first constructed.
  currentPersonaId = grumpy.id

  await driver.handleMessage(42, 100, "/new")
  await driver.handleMessage(42, 100, "hi again")
  saved = await loadLatestSessionRowForOwner(telegramOwner(42))
  expect(saved!.persona).toBe("grumpy")
})

test("confirm_command sends an approval keyboard, and approving runs the command", async () => {
  const { sender, sent, edited } = fakeSender()
  const driver = makeDriver(
    [
      {
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "run_command",
              arguments: JSON.stringify({
                command: "true",
                description: "Do nothing",
                mutates: true
              })
            }
          }
        ]
      },
      { content: "Done." }
    ],
    sender
  )

  await driver.handleMessage(42, 100, "please run true")

  const confirmMsg = sent.find(s => s.replyMarkup)
  expect(confirmMsg).toBeDefined()
  expect(confirmMsg!.replyMarkup).toEqual([
    [
      {
        text: `✅ ${t("confirmCommand.yes")}`,
        callback_data: `cmd:approve:${approvalToken("call_1")}`
      },
      {
        text: `❌ ${t("confirmCommand.no")}`,
        callback_data: `cmd:decline:${approvalToken("call_1")}`
      }
    ]
  ])

  const confirmMessageId = sent.indexOf(confirmMsg!) + 1
  await driver.handleCallbackQuery(42, 100, confirmMessageId, `cmd:approve:${approvalToken("call_1")}`, "cbq_1")

  expect(edited.some(e => e.text.includes(t("telegram.approved")))).toBe(true)
  expect(edited.at(-1)!.text).toBe("Done.")
})

function approvalTool(executed: unknown[]): Tool<never> {
  return {
    ...tool<{ title: string }>({
      name: "create_issue",
      description: "Create an issue",
      parameters: { type: "object", properties: { title: { type: "string" } } },
      execute: async args => {
        executed.push(args)
        return `created ${args.title}`
      }
    }),
    approval: (args: { title: string }) => `POST https://api.example.com/issues {"title":"${args.title}"}`
  } as unknown as Tool<never>
}

const approvalScript: FakeMessage[] = [
  {
    content: null,
    tool_calls: [{ id: "call_t", type: "function", function: { name: "create_issue", arguments: '{"title":"Bug"}' } }]
  },
  { content: "Filed." }
]

test("confirm_tool sends the request summary with an approval keyboard, and approving runs the tool", async () => {
  const { sender, sent, edited } = fakeSender()
  const executed: unknown[] = []
  const driver = makeDriver(approvalScript, sender, [approvalTool(executed)])

  await driver.handleMessage(42, 100, "file a bug")

  const confirmMsg = sent.find(s => s.replyMarkup)
  expect(confirmMsg!.text).toContain("POST https://api.example.com/issues")
  expect(confirmMsg!.replyMarkup).toEqual([
    [
      { text: `✅ ${t("confirmCommand.yes")}`, callback_data: `tool:approve:${approvalToken("call_t")}` },
      { text: `❌ ${t("confirmCommand.no")}`, callback_data: `tool:decline:${approvalToken("call_t")}` }
    ],
    [{ text: `✅ ${t("telegram.approveSession")}`, callback_data: `tool:approve_session:${approvalToken("call_t")}` }]
  ])
  expect(executed).toEqual([])

  // A cmd: callback can't resolve a tool approval.
  await driver.handleCallbackQuery(
    42,
    100,
    sent.indexOf(confirmMsg!) + 1,
    `cmd:approve:${approvalToken("call_t")}`,
    "cbq_0"
  )
  expect(executed).toEqual([])

  await driver.handleCallbackQuery(
    42,
    100,
    sent.indexOf(confirmMsg!) + 1,
    `tool:approve:${approvalToken("call_t")}`,
    "cbq_1"
  )
  expect(executed).toEqual([{ title: "Bug" }])
  expect(edited.at(-1)!.text).toBe("Filed.")
})

test("approving a tool for the chat runs it, and its next call doesn't ask again", async () => {
  const { sender, sent, edited } = fakeSender()
  const executed: unknown[] = []
  const ability = { ...approvalTool(executed), source: "ability:issues" } as Tool<never>
  const script: FakeMessage[] = [
    ...approvalScript,
    {
      content: null,
      tool_calls: [{ id: "call_u", type: "function", function: { name: "create_issue", arguments: '{"title":"Two"}' } }]
    },
    { content: "Filed again." }
  ]
  const driver = makeDriver(script, sender, [ability])

  await driver.handleMessage(42, 100, "file a bug")
  const prompt = sent.find(s => s.replyMarkup)!
  await driver.handleCallbackQuery(42, 100, sent.indexOf(prompt) + 1, prompt.replyMarkup![1]![0]!.callback_data, "q")
  expect(executed).toEqual([{ title: "Bug" }])

  await driver.handleMessage(42, 100, "and another")
  expect(executed).toEqual([{ title: "Bug" }, { title: "Two" }])
  expect(sent.filter(s => s.replyMarkup)).toHaveLength(1)
  expect(edited.at(-1)!.text).toBe("Filed again.")
})

test("declining a tool request doesn't run it", async () => {
  const { sender, sent, edited } = fakeSender()
  const executed: unknown[] = []
  const driver = makeDriver(approvalScript, sender, [approvalTool(executed)])

  await driver.handleMessage(42, 100, "file a bug")
  const confirmMsg = sent.find(s => s.replyMarkup)
  await driver.handleCallbackQuery(
    42,
    100,
    sent.indexOf(confirmMsg!) + 1,
    `tool:decline:${approvalToken("call_t")}`,
    "cbq_1"
  )

  expect(executed).toEqual([])
  expect(edited.some(e => e.text.includes(t("telegram.declined")))).toBe(true)
  expect(edited.at(-1)!.text).toBe("Filed.")
})

test("declining a command feeds back a decline notice without a user-role event", async () => {
  const { sender, sent, edited } = fakeSender()
  const driver = makeDriver(
    [
      {
        content: null,
        tool_calls: [
          {
            id: "call_2",
            type: "function",
            function: {
              name: "run_command",
              arguments: JSON.stringify({
                command: "true",
                description: "Do nothing",
                mutates: true
              })
            }
          }
        ]
      },
      { content: "Understood." }
    ],
    sender
  )

  await driver.handleMessage(42, 100, "please run true")
  const confirmMsg = sent.find(s => s.replyMarkup)!
  const confirmMessageId = sent.indexOf(confirmMsg) + 1
  await driver.handleCallbackQuery(42, 100, confirmMessageId, `cmd:decline:${approvalToken("call_2")}`, "cbq_2")

  expect(edited.some(e => e.text.includes(t("telegram.declined")))).toBe(true)
  expect(edited.at(-1)!.text).toBe("Understood.")

  const saved = await loadLatestSessionRowForOwner(telegramOwner(42))
  expect(saved).toBeDefined()
  const userEvents = saved!.events.filter((e: { type: string }) => e.type === "user")
  expect(userEvents).toHaveLength(1)
  expect((userEvents[0] as unknown as { text: string }).text).toBe("please run true")
})

test("a callback with a stale/mismatched token doesn't touch state", async () => {
  const { sender, sent, edited } = fakeSender()
  const driver = makeDriver(
    [
      {
        content: null,
        tool_calls: [
          {
            id: "call_3",
            type: "function",
            function: {
              name: "run_command",
              arguments: JSON.stringify({
                command: "true",
                description: "Do nothing",
                mutates: true
              })
            }
          }
        ]
      }
    ],
    sender
  )

  await driver.handleMessage(42, 100, "please run true")
  const confirmMsg = sent.find(s => s.replyMarkup)!
  const confirmMessageId = sent.indexOf(confirmMsg) + 1

  await driver.handleCallbackQuery(42, 100, confirmMessageId, "cmd:approve:not-the-real-token", "cbq_stale")

  expect(edited.at(-1)!.text).toBe(t("telegram.commandExpired"))
})

/** A run_command call the model makes; `command` is shown for approval as written. */
function runCommandCall(id: string, command = "true") {
  return {
    content: null,
    tool_calls: [
      {
        id,
        type: "function" as const,
        function: { name: "run_command", arguments: JSON.stringify({ command, description: "Do it", mutates: true }) }
      }
    ]
  }
}

test("a message instead of a tap skips the waiting command, like the cloud bot, and the turn goes on", async () => {
  const { sender, sent, edited } = fakeSender()
  const driver = makeDriver([runCommandCall("call_4"), { content: "Okay, I won't." }], sender)

  await driver.handleMessage(42, 100, "please run true")
  const prompt = sent.find(s => s.replyMarkup)!
  requests.length = 0
  await driver.handleMessage(42, 100, "actually, don't")

  const promptEdit = edited.find(e => e.messageId === sent.indexOf(prompt) + 1)!
  expect(promptEdit.text).toContain(t("telegram.skipped"))
  expect(promptEdit.replyMarkup).toEqual([])
  expect(requests[0]!.at(-1) as unknown).toEqual({
    role: "tool",
    tool_call_id: "call_4",
    content: notApprovedPrompt("actually, don't")
  })
  expect(edited.at(-1)!.text).toBe("Okay, I won't.")

  // The old buttons are stale now
  await driver.handleCallbackQuery(42, 100, sent.indexOf(prompt) + 1, `cmd:approve:${approvalToken("call_4")}`, "q")
  expect(edited.at(-1)!.text).toBe(t("telegram.commandExpired"))
})

test("/compact while a command waits gets a reminder instead", async () => {
  const { sender, sent } = fakeSender()
  const driver = makeDriver([runCommandCall("call_5")], sender)
  await driver.handleMessage(42, 100, "please run true")
  await driver.handleMessage(42, 100, "/compact")
  expect(sent.at(-1)!.text).toBe(t("telegram.pendingCommand"))
})

test("the command to approve is shown exactly as it will run, never as Markdown", async () => {
  const { sender, sent } = fakeSender()
  const command = 'find . -name "*.ts" -o -name "*.tsx" && echo __init__ > a_b'
  const driver = makeDriver([runCommandCall("call_6", command)], sender)
  await driver.handleMessage(42, 100, "find them")
  const prompt = sent.find(s => s.replyMarkup)!
  expect(prompt.text).toContain(
    "<pre><code>$ find . -name &quot;*.ts&quot; -o -name &quot;*.tsx&quot; &amp;&amp; echo __init__ &gt; a_b</code></pre>".replaceAll(
      "&quot;",
      '"'
    )
  )
})

test("an approval asked for before any text removes the empty placeholder", async () => {
  const { sender, sent, deleted } = fakeSender()
  const driver = makeDriver([runCommandCall("call_7")], sender)
  await driver.handleMessage(42, 100, "please run true")
  expect(sent[0]!.text).toBe("…")
  expect(deleted).toEqual([1])
})

test("a question's options become buttons, a tap answers it once, and a later tap says it was answered", async () => {
  const { sender, edited } = fakeSender()
  const ask = {
    id: "call_q",
    type: "function" as const,
    function: { name: "ask_user", arguments: JSON.stringify({ question: "Proceed?", options: ["Yes", "No"] }) }
  }
  const driver = makeDriver([{ content: null, tool_calls: [ask] }, { content: "Standing down." }], sender)

  await driver.handleMessage(42, 100, "deploy")
  const asked = edited.find(e => e.replyMarkup?.length)!
  expect(asked.text).toBe("Proceed?")
  expect(asked.replyMarkup!.map(row => row.map(button => button.text))).toEqual([["Yes"], ["No"]])
  expect(asked.replyMarkup![1]![0]!.callback_data).toBe(`ask:${approvalToken("call_q")}:1`)

  const tap = asked.replyMarkup![1]![0]!.callback_data
  await driver.handleCallbackQuery(42, 100, asked.messageId, tap, "q1", "Proceed?")
  expect(edited.find(e => e.messageId === asked.messageId && e.text === "Proceed?\n\n→ No")).toBeDefined()
  expect(edited.at(-1)!.text).toBe("Standing down.")
  expect(requests.at(-1)!.at(-1)).toMatchObject({ role: "tool", tool_call_id: "call_q", content: "No" })

  await driver.handleCallbackQuery(42, 100, asked.messageId, tap, "q2", "Proceed?")
  expect(edited.at(-1)).toMatchObject({
    messageId: asked.messageId,
    text: `Proceed?\n\n${t("telegram.questionExpired")}`,
    replyMarkup: []
  })
})

test("a tap while the turn that asked is still finishing waits for it instead of running beside it", async () => {
  const { sender, sent, edited } = fakeSender()
  const driver = makeDriver([runCommandCall("call_8"), { content: "Done." }], sender)
  let tapped: Promise<void> | undefined
  const send = sender.sendMessage.bind(sender)
  sender.sendMessage = async (chatId, text, opts) => {
    const result = await send(chatId, text, opts)
    // Tap the moment the prompt arrives: the turn is still running then
    if (opts?.replyMarkup?.length && !tapped)
      tapped = driver.handleCallbackQuery(42, chatId, result.messageId, opts.replyMarkup[0]![0]!.callback_data, "q")
    return result
  }

  await driver.handleMessage(42, 100, "please run true")
  await tapped
  expect(edited.some(e => e.text.includes(t("telegram.approved")))).toBe(true)
  expect(edited.at(-1)!.text).toBe("Done.")
  expect(sent.filter(s => s.text === t("telegram.stillWorking"))).toEqual([])
})

test("a round that calls tools keeps its text as its own message, and the answer follows in a new one", async () => {
  const { sender, sent, edited } = fakeSender()
  const driver = makeDriver(
    [{ ...runCommandCall("call_9", "pwd"), content: "Let me check." }, { content: "You're in /tmp." }],
    sender
  )
  await driver.handleMessage(42, 100, "where am I?")
  expect(edited.find(e => e.messageId === 1)!.text).toBe("Let me check.")
  expect(sent.at(-1)!.text).toBe("You're in /tmp.")
  expect(edited.some(e => e.text.includes("Let me check.You're"))).toBe(false)
})

test("an error line is escaped for Telegram's HTML", async () => {
  const { sender, edited } = fakeSender()
  const driver = makeDriver([{ content: null, reject: 400, rejectMessage: "<html>Bad Gateway</html> & more" }], sender)
  await driver.handleMessage(42, 100, "hi")
  expect(edited.at(-1)!.text).toContain("&lt;html&gt;Bad Gateway&lt;/html&gt; &amp; more")
})

test("an owner's /start gets a welcome, not a turn", async () => {
  const { sender, sent } = fakeSender()
  const driver = makeDriver([], sender)
  await driver.handleMessage(42, 100, "/start")
  await driver.handleMessage(42, 100, "/start K7Q2-M9XD")
  expect(sent.map(s => s.text)).toEqual([t("telegram.welcome"), t("telegram.welcome")])
})

test("switch_persona mid-turn updates the user's persona and the persisted row", async () => {
  const kaja: Persona = { id: "kaja", label: "Kaja" }
  const grumpy: Persona = {
    id: "grumpy",
    label: "Grumpy",
    instructions: "You are grumpy.",
    when: "the user wants sass"
  }
  const { sender, edited } = fakeSender()
  const driver = createTelegramDriver({
    agentConfig: { model: "fake-model", tools: [askUserTool, runCommandTool], store: peekStore() },
    personas: [kaja, grumpy],
    models: [],
    sender,
    createAgent: init =>
      Object.assign(
        fakeAgent(
          [
            {
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "switch_persona",
                    arguments: JSON.stringify({ persona: "grumpy" })
                  }
                }
              ]
            },
            { content: "Fine, I'm listening." }
          ],
          [switchPersonaTool]
        ),
        { personas: [kaja, grumpy], models: [], personaId: init.personaId }
      ) as unknown as Agent
  })

  await driver.handleMessage(42, 100, "be sassy")

  expect(edited.at(-1)!.text).toBe("Fine, I'm listening.")
  const saved = await loadLatestSessionRowForOwner(telegramOwner(42))
  expect(saved!.persona).toBe("grumpy")
  const system = (saved!.session as { messages: { role: string; content: string }[] }).messages[0]
  expect(system!.role).toBe("system")
  expect(system!.content).toContain("You are grumpy.")
})

test("/compact: nothing to do on a fresh chat, then summarises and saves the conversation", async () => {
  const { sender, sent } = fakeSender()
  const driver = makeDriver([{ content: "One." }, { content: "Two." }], sender)

  await driver.handleMessage(77, 100, "/compact")
  expect(sent.at(-1)!.text).toBe("Nothing to compact yet.")

  await driver.handleMessage(77, 100, "first")
  await driver.handleMessage(77, 100, "second")
  await driver.handleMessage(77, 100, "/compact keep the numbers")

  expect(sent.at(-1)!.text).toStartWith("🗜 Conversation compacted:")
  const saved = await loadLatestSessionRowForOwner(telegramOwner(77))
  expect((saved!.session as { summary?: { text: string } }).summary?.text).toBe("SUMMARY")
})

test("/abilities lists what each persona uses, and how to change it", async () => {
  const { sender, sent } = fakeSender()
  const helper: Persona = { ...defaultPersona, abilities: ["open-meteo", { name: "context7", tools: ["docs"] }] }
  const driver = createTelegramDriver({
    agentConfig: { model: "fake-model", tools: [askUserTool], store: peekStore() },
    personas: [helper, persona],
    models: [],
    sender
  })

  await driver.handleMessage(42, 100, "/abilities@kaja_bot")
  const text = sent.at(-1)!.text
  expect(text).toContain(
    t("telegram.abilitiesPersona", { persona: "Helpful assistant", names: "open-meteo, context7" })
  )
  expect(text).toContain(t("telegram.abilitiesPersonaNone", { persona: "Kaja" }))
  expect(text).toContain("kaja abilities")
})

test("a tool image goes out captioned with its alt text, and takes its description as its caption once written", async () => {
  const { createMemoryStore } = await import("@kaja/nasi")
  const imageTool = tool<Record<string, never>>({
    name: "make_picture",
    description: "test tool that returns images",
    parameters: { type: "object", properties: {} },
    execute: async () => ({ text: "Made a picture", images: [{ data: TINY_PNG, mimeType: "image/png" }] })
  })
  const describer = {
    client: {
      chat: { completions: { create: async () => ({ choices: [{ message: { content: "A tiny square." } }] }) } }
    },
    model: "vision-m"
  }
  const { sender, photos, captions } = fakeSender()
  const script: FakeMessage[] = [
    {
      content: null,
      tool_calls: [{ id: "call_1", type: "function", function: { name: "make_picture", arguments: "{}" } }]
    },
    { content: "Here." }
  ]
  const driver = createTelegramDriver({
    agentConfig: { model: "fake-model", tools: [askUserTool, runCommandTool] },
    personas: [persona],
    models: [],
    sender,
    createAgent: () =>
      // Blind, so the turn waits for the description before it ends
      Object.assign(fakeAgent(script, [imageTool]), {
        store: createMemoryStore(),
        describer,
        defaultDescriber: describer,
        chatSeesImages: false
      }) as unknown as Agent
  })

  await driver.handleMessage(42, 100, "draw me something")

  expect(photos).toHaveLength(1)
  expect(photos[0]!.caption).toBe("Made a picture")
  expect(captions).toEqual([{ chatId: 100, messageId: 101, caption: "A tiny square." }])
})
