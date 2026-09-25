import { beforeEach, expect, test } from "bun:test"
import { mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Persona } from "@kaja/schema/cli"
import { APIError } from "openai"
import type { Agent, Tool } from "../../../lib/agent/agents"
import type { InlineKeyboardLike, TelegramSender } from "../../../lib/telegram/driver"

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

[tasks]
chat = "chat"

[models.chat]
model = "x"
tasks = ["chat"]
provider = "default"
`
)

const { invalidateConfigCache } = await import("../../../lib/config/config")
const { askUserTool, runCommandTool, switchPersonaTool, tool } = await import("../../../lib/agent/agents")
const { peekStore } = await import("../../../lib/memory/store")
const { createSessionRow, deleteSessionRow, listSessions, loadLatestSessionRowForOwner } = await import(
  "../../../lib/session/store"
)
const { telegramOwner } = await import("@kaja/schema/store")
const { createTelegramDriver } = await import("../../../lib/telegram/driver")
const { t } = await import("../../../lib/i18n")

beforeEach(async () => {
  process.env.XDG_DATA_HOME = dataDir
  process.env.XDG_CONFIG_HOME = configDir
  invalidateConfigCache()
  for (const session of await listSessions()) await deleteSessionRow(session.id)
})

type FakeMessage = {
  /** The provider refuses the request with this status instead of answering. */
  reject?: number
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
            throw APIError.generate(message.reject, { message: "image input unsupported" }, undefined, new Headers())
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
  const photos: {
    chatId: number
    photo: { path: string } | { url: string }
    caption?: string
  }[] = []
  const sender: TelegramSender = {
    async sendMessage(chatId, text, opts) {
      const messageId = nextMessageId++
      sent.push({ chatId, text, replyMarkup: opts?.replyMarkup })
      return { messageId }
    },
    async editMessageText(chatId, messageId, text, opts) {
      edited.push({ chatId, messageId, text, replyMarkup: opts?.replyMarkup })
    },
    async answerCallbackQuery(callbackQueryId, opts) {
      answered.push({ callbackQueryId, text: opts?.text })
    },
    async sendPhoto(chatId, photo, opts) {
      photos.push({ chatId, photo, caption: opts?.caption })
    }
  }
  return { sender, sent, edited, answered, photos }
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
  const imagePath = join(tmpdir(), "kaja-test-telegram-photo.png")
  writeFileSync(imagePath, "not-a-real-png")
  const imageTool = tool<Record<string, never>>({
    name: "make_picture",
    description: "test tool that returns images",
    parameters: { type: "object", properties: {} },
    execute: async () => ({
      text: "made a picture",
      images: [{ path: imagePath, mimeType: "image/png" }],
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
  expect(photos[1]!.photo).toEqual({ path: imagePath })
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
  const photo = "data:image/jpeg;base64,/9j/4AAQ"
  const { sender, edited } = fakeSender()
  const driver = makeDriver([{ content: "A cat." }, { content: null, reject: 400 }, { content: "Sure." }], sender)

  requests.length = 0
  await driver.handleMessage(42, 100, "what is it?", [photo])
  expect(requests[0]!.at(-1)).toEqual({
    role: "user",
    content: [
      { type: "text", text: "what is it?" },
      { type: "image_url", image_url: { url: photo } }
    ]
  })
  expect(edited.at(-1)!.text).toBe("A cat.")

  // A caption that looks like a command is still just the photo's text
  await driver.handleMessage(42, 100, "/new", [photo])
  expect(edited.at(-1)!.text).toBe(t("telegram.noVision"))

  await driver.handleMessage(42, 100, "never mind")
  const images = requests[2]!
    .flatMap(m => (Array.isArray(m.content) ? m.content : []))
    .filter(p => p.type === "image_url")
  // Only the first photo, which the model did take, is still in the conversation
  expect(images).toHaveLength(1)
  expect(edited.at(-1)!.text).toBe("Sure.")
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
        callback_data: "cmd:approve:call_1"
      },
      {
        text: `❌ ${t("confirmCommand.no")}`,
        callback_data: "cmd:decline:call_1"
      }
    ]
  ])

  const confirmMessageId = sent.indexOf(confirmMsg!) + 1
  await driver.handleCallbackQuery(42, 100, confirmMessageId, "cmd:approve:call_1", "cbq_1")

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
      { text: `✅ ${t("confirmCommand.yes")}`, callback_data: "tool:approve:call_t" },
      { text: `❌ ${t("confirmCommand.no")}`, callback_data: "tool:decline:call_t" }
    ]
  ])
  expect(executed).toEqual([])

  // A cmd: callback can't resolve a tool approval.
  await driver.handleCallbackQuery(42, 100, sent.indexOf(confirmMsg!) + 1, "cmd:approve:call_t", "cbq_0")
  expect(executed).toEqual([])

  await driver.handleCallbackQuery(42, 100, sent.indexOf(confirmMsg!) + 1, "tool:approve:call_t", "cbq_1")
  expect(executed).toEqual([{ title: "Bug" }])
  expect(edited.at(-1)!.text).toBe("Filed.")
})

test("declining a tool request doesn't run it", async () => {
  const { sender, sent, edited } = fakeSender()
  const executed: unknown[] = []
  const driver = makeDriver(approvalScript, sender, [approvalTool(executed)])

  await driver.handleMessage(42, 100, "file a bug")
  const confirmMsg = sent.find(s => s.replyMarkup)
  await driver.handleCallbackQuery(42, 100, sent.indexOf(confirmMsg!) + 1, "tool:decline:call_t", "cbq_1")

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
  await driver.handleCallbackQuery(42, 100, confirmMessageId, "cmd:decline:call_2", "cbq_2")

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

test("a message while busy or a command is pending gets a reminder instead of interleaving", async () => {
  const { sender, sent, edited } = fakeSender()
  const driver = makeDriver(
    [
      {
        content: null,
        tool_calls: [
          {
            id: "call_4",
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
  const editsAfterFirstTurn = edited.length

  await driver.handleMessage(42, 100, "another message while pending")

  expect(sent.at(-1)!.text).toBe(t("telegram.pendingCommand"))
  expect(edited).toHaveLength(editsAfterFirstTurn)
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
      ({
        ...fakeAgent(
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
        personas: [kaja, grumpy],
        models: [],
        personaId: init.personaId
      }) as unknown as Agent
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

test("/abilities lists the skills, personas and tool abilities the bot loaded, and how to change them", async () => {
  const { createLoadSkillTool } = await import("@kaja/nasi")
  const loadSkill = createLoadSkillTool({
    store: {
      listSkills: async () => [],
      readSkill: async () => undefined,
      listHttpTools: async () => [],
      listMcpAbilities: async () => []
    },
    skills: [
      { name: "notes", description: "Keep notes.", files: [] },
      { name: "disk-check", description: "Check disks.", files: [] }
    ]
  })
  const forecast = tool({ name: "weather_forecast", description: "x", parameters: {}, execute: async () => "ok" })
  const packaged = [
    { ...forecast, origin: "community" as const, source: "ability:open-meteo" },
    { ...forecast, origin: "community" as const, source: "ability:context7" },
    { ...forecast, origin: "third-party" as const, source: "mcp:my-server" }
  ]
  const { sender, sent } = fakeSender()
  const driver = createTelegramDriver({
    agentConfig: { model: "fake-model", tools: [askUserTool, loadSkill, ...packaged], store: peekStore() },
    personas: [defaultPersona, persona],
    models: [],
    sender
  })

  await driver.handleMessage(42, 100, "/abilities@kaja_bot")
  const text = sent.at(-1)!.text
  expect(text).toContain(t("telegram.abilitiesSkills", { names: "disk-check, notes" }))
  expect(text).toContain(t("telegram.abilitiesTools", { names: "context7, open-meteo" }))
  // default always loads, so it isn't listed.
  expect(text).toContain(t("telegram.abilitiesPersonas", { names: "kaja" }))
  expect(text).not.toContain("my-server")
  expect(text).toContain("kaja abilities")

  const empty = fakeSender()
  await createTelegramDriver({
    agentConfig: { model: "fake-model", tools: [askUserTool], store: peekStore() },
    personas: [defaultPersona],
    models: [],
    sender: empty.sender
  }).handleMessage(42, 100, "/abilities")
  expect(empty.sent.at(-1)!.text).toContain(t("telegram.abilitiesNone"))
})
