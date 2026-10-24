import {
  ASK_USER_OPTIONS_INSTRUCTION,
  ASK_USER_TOOL,
  createGuardedFetch,
  createOpenAIClient,
  type FetchLike,
  type McpSandbox,
  Nasi,
  NoModelError,
  replyLanguageInstructionFor,
  resolveContextWindow,
  setDatasetLoaders
} from "@kaja/nasi"
import type { Persona } from "@kaja/schema/abilities"
import type { NasiTurnRequest, NasiTurnResponse } from "@kaja/schema/nasi"
import { isPublicHttpUrl } from "@kaja/shared/net"
import { sql } from "../../core/db"
import { env } from "../../core/env"
import { withLock, withLockGenerator } from "../../core/lock"
import { abilityService, modelService, sandboxService } from "../../services"
import { egressFor, mcpSandboxFor, type SandboxKeys } from "../sandbox"
import { createPostgresAbilityStore } from "./pg-abilities"
import { nasiStore } from "./store"

export type ChatResolver = () => Promise<{
  client: ReturnType<typeof createOpenAIClient>
  model: string
  contextWindow?: number
  seesImages?: boolean
}>

let chatResolver: ChatResolver | undefined

export function setNasiChatResolver(resolver: ChatResolver | undefined) {
  chatResolver = resolver
}

/** A widget's chat client: the test resolver when installed, else exactly `pinnedModel`, with no random fallback. */
export function resolveWidgetChat(pinnedModel: string) {
  return chatResolver ? chatResolver() : defaultChatResolver(pinnedModel, true)
}

type DescriberResolver = () => Promise<{ client: ReturnType<typeof createOpenAIClient>; model: string } | undefined>

let describerResolver: DescriberResolver | undefined

/** Tests: the vision model turns describe images with, instead of the catalog's. */
export function setNasiDescriberResolver(resolver: DescriberResolver | undefined) {
  describerResolver = resolver
}

/** The vision model images are described with (a test's stand-in when set), or undefined when there's none. */
export function cloudDescriber() {
  return describerResolver ? describerResolver() : resolveDescriber()
}

/**
 * Reuses an existing session's model so it doesn't change mid-conversation; falls back to a fresh random pick if that
 * model was since disabled/deleted (or there's no pinned model yet, i.e. a new session).
 */
export async function resolveModelWithProvider(pinnedModel?: string) {
  return pinnedModel
    ? ((await modelService.getModelWithProviderByName(pinnedModel)) ??
        (await modelService.getRandomModelWithProvider()))
    : modelService.getRandomModelWithProvider()
}

/**
 * Cloud model HTTP. Public hosts only, DNS pinned, redirects stay on that host, and the body is streamed (chat
 * completions are not buffered). Never sent through a sandbox like tool requests: the provider's key stays on this
 * host.
 */
function cloudModelFetch(): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  const guarded = createGuardedFetch()
  return (input, init) => guarded(input instanceof Request ? input.url : input, init)
}

async function defaultChatResolver(pinnedModel?: string, strict = false) {
  const stub = env.NASI_STUB_MODEL
  if (stub) {
    return {
      // Port 9 is the RFC 863 discard port — nothing listens there, so a real call fails fast instead of silently hitting something else.
      client: createOpenAIClient({ baseURL: "http://127.0.0.1:9", apiKey: "stub" }),
      model: stub
    }
  }
  const result =
    strict && pinnedModel
      ? await modelService.getModelWithProviderByName(pinnedModel)
      : await resolveModelWithProvider(pinnedModel)
  if (!result) throw new NoModelError()
  if (!isPublicHttpUrl(result.provider.baseUrl)) throw new Error("unsafe_model_url")
  const modelFetch = cloudModelFetch()
  const window = await resolveContextWindow(
    {
      baseUrl: result.provider.baseUrl,
      apiKey: result.provider.apiKey ?? undefined,
      model: result.model.model,
      contextWindow: result.model.contextWindow ?? undefined
    },
    modelFetch
  )
  return {
    client: createOpenAIClient({
      baseURL: result.provider.baseUrl,
      apiKey: result.provider.apiKey ?? "unused",
      fetch: modelFetch
    }),
    model: result.model.model,
    contextWindow: window.tokens,
    seesImages: result.model.images
  }
}

/**
 * A free, enabled `vision` model (the catalog's default is seeded), which describes arriving images; else undefined and
 * they keep their alt text.
 */
async function resolveDescriber() {
  if (env.NASI_STUB_MODEL) return undefined
  const result = await modelService.getRandomModelWithProvider("vision")
  if (!result || !isPublicHttpUrl(result.provider.baseUrl)) return undefined
  return {
    client: createOpenAIClient({
      baseURL: result.provider.baseUrl,
      apiKey: result.provider.apiKey ?? "unused",
      fetch: cloudModelFetch()
    }),
    model: result.model.model
  }
}

/** A free, enabled `summarize` model (the catalog's default is seeded), else undefined and the chat model summarises. */
async function resolveSummarizer() {
  if (env.NASI_STUB_MODEL) return undefined
  const result = await modelService.getRandomModelWithProvider("summarize")
  if (!result || !isPublicHttpUrl(result.provider.baseUrl)) return undefined
  const target = {
    baseUrl: result.provider.baseUrl,
    apiKey: result.provider.apiKey ?? undefined,
    model: result.model.model,
    contextWindow: result.model.contextWindow ?? undefined
  }
  const modelFetch = cloudModelFetch()
  return {
    client: createOpenAIClient({
      baseURL: target.baseUrl,
      apiKey: target.apiKey ?? "unused",
      fetch: modelFetch
    }),
    model: target.model,
    contextWindow: (await resolveContextWindow(target, modelFetch)).tokens
  }
}

/**
 * Host-neutral replacement for the CLI's terminal-flavored ask_user contract — cloud chat is a normal message UI, not a
 * terminal that blocks on tool calls.
 */
const CLOUD_ASK_USER_INSTRUCTION =
  `You talk to the human through a chat interface, and they can only reply ` +
  `when you call the ${ASK_USER_TOOL} tool — plain text output is shown to ` +
  `them but gives them no way to answer. So EVERY time you expect a reply — ` +
  `a question, a confirmation, their turn in a game (e.g. "Question 3: is ` +
  `it alive?") — deliver it by calling ${ASK_USER_TOOL}. Never write a ` +
  `question as plain text: plain messages are only for statements and ` +
  `results that need no reply, and end the conversation turn. That also ` +
  `means no courtesy closers like "Would you like...?" or "Let me know ` +
  `if..." — the conversation is over the moment you send plain text, so ` +
  `either call ${ASK_USER_TOOL} because you genuinely need an answer, or ` +
  `just state the result and stop. ${ASK_USER_OPTIONS_INSTRUCTION}`

/** Points dataset_info and the "About the user" section at the marketplace's datasets in the ability table. */
export function registerAbilityDatasets() {
  setDatasetLoaders({
    loadDatasets: () => abilityService.datasets(),
    loadDataset: async topic => (await abilityService.datasets()).get(topic)
  })
}
registerAbilityDatasets()

type Egress = (ability?: string) => FetchLike
let egressOverride: ((userId: string) => Egress) | undefined

/** Test seam: where a user's turns send their tool requests. Pass undefined to restore the connected sandboxes. */
export function setNasiEgressOverride(egress: ((userId: string) => Egress) | undefined) {
  egressOverride = egress
}

/**
 * Where a user's cloud turn sends its tool requests (`fetch_url`, HTTP tools, remote MCP): a sandbox, never this host,
 * and one the key a call carries may go to (`keys`; without them an ability's calls only go to the official sandbox).
 */
export function cloudEgress(userId: string, keys?: SandboxKeys): Egress {
  return egressOverride ? egressOverride(userId) : egressFor(userId, keys)
}

// Said to a user's turns when their stdio abilities may run on a sandbox another person runs.
const SHARED_SANDBOX_NOTE =
  " Some tools may run on another person's computer, who can see what they do. The browser does not: it stays on " +
  "this user's own sandbox or the official one. Never send the user's personal data through a tool that runs elsewhere."

type SandboxPicker = (userId: string, keys: SandboxKeys) => McpSandbox
let sandboxOverride: SandboxPicker | undefined

/** Test seam: how a user's turns reach an MCP sandbox. Pass undefined to restore the connected sandboxes. */
export function setNasiSandboxOverride(picker: SandboxPicker | undefined) {
  sandboxOverride = picker
}

/** Where a user's stdio abilities run: a sandbox, with the key each one starts with (`keys`). The caller closes it. */
export function cloudSandbox(userId: string, keys: SandboxKeys): McpSandbox {
  return (sandboxOverride ?? mcpSandboxFor)(userId, keys)
}

/**
 * Shared by cloud turns (`/nasi/turn*`, the cloud Telegram bot) — same account, `owner` distinguishes whose rows within
 * it. The caller closes it after the turn (its MCP connections).
 */
export async function openNasiFor(opts: {
  userId: string
  owner?: string | null
  pinnedModel?: string
  language?: string
  /** How replies should read where they're shown (see `PromptContext.channelInstruction`). */
  channelInstruction?: string
  /** What the user's terminal runs on their computer this turn, and their own personas (see {@link clientOf}). */
  client?: TurnClient
}): Promise<Nasi> {
  const [chat, summarizer, describer] = await Promise.all([
    chatResolver ? chatResolver() : defaultChatResolver(opts.pinnedModel),
    resolveSummarizer(),
    cloudDescriber()
  ])
  // Every user's roster is the whole catalog, plus the terminal's own personas; each persona's `abilities` picks what a turn uses.
  const personas = withOwnPersonas(await abilityService.personaCatalog(), opts.client?.personas ?? [])
  const [keys, sandboxSettings] = await Promise.all([
    abilityService.serviceKeys(),
    sandboxService.settings(opts.userId)
  ])
  const keyOf: SandboxKeys = name => keys.get(name)
  return Nasi.open({
    store: nasiStore(opts.userId),
    chat,
    summarizer,
    describer,
    personas,
    owner: opts.owner,
    egress: cloudEgress(opts.userId, keyOf),
    abilities: createPostgresAbilityStore(),
    abilityKey: name => keys.get(name)?.value,
    // Always set, so a stdio ability never runs on this host: with no sandbox online, its requests fail instead.
    mcpSandbox: cloudSandbox(opts.userId, keyOf),
    client: opts.client && { tools: opts.client.tools, skills: opts.client.skills },
    promptContext: {
      environment:
        (opts.client ? TERMINAL_ENVIRONMENT : CLOUD_ENVIRONMENT) +
        "Use only the tools you were given — if a tool you'd want isn't there, say so instead of guessing." +
        (sandboxSettings?.useShared ? SHARED_SANDBOX_NOTE : ""),
      askUserInstruction: CLOUD_ASK_USER_INSTRUCTION,
      channelInstruction: opts.channelInstruction,
      replyLanguageInstruction: opts.language ? replyLanguageInstructionFor(opts.language) : undefined
    }
  })
}

const CLOUD_ENVIRONMENT = "You are Kaja cloud chat. You have no access to the user's machine — you cannot run a shell. "
const TERMINAL_ENVIRONMENT =
  "You are Kaja cloud chat, talking to the user's terminal: some of your tools run on their own computer through it " +
  "(their files, programs and, if they allowed it, their shell), each asking them first when it needs to. "

/**
 * What a terminal declares with a turn: the tools and skills it runs on the user's computer, and the user's own
 * personas.
 */
export type TurnClient = {
  tools: NonNullable<NasiTurnRequest["clientTools"]>
  skills: NonNullable<NasiTurnRequest["clientSkills"]>
  personas: NonNullable<NasiTurnRequest["clientPersonas"]>
}

/** The terminal's declarations in a turn request, or undefined when it declared none (every non-terminal caller). */
export function clientOf(body: NasiTurnRequest): TurnClient | undefined {
  if (!body.clientTools && !body.clientSkills && !body.clientPersonas) return undefined
  return { tools: body.clientTools ?? [], skills: body.clientSkills ?? [], personas: body.clientPersonas ?? [] }
}

/**
 * The catalog with the user's own personas added; one with a catalog persona's id takes its place, `default` staying
 * first.
 */
export function withOwnPersonas(catalog: Persona[], own: Persona[]): Persona[] {
  if (own.length === 0) return catalog
  const mine = new Map(own.map(persona => [persona.id, persona]))
  return [
    ...catalog.map(persona => mine.get(persona.id) ?? persona),
    ...own.filter(persona => !catalog.some(c => c.id === persona.id))
  ]
}

/**
 * Serializes turns on an existing session so overlapping requests (retries, duplicate tabs) can't race the
 * read-modify-write around session persistence; a new session (no id yet) has no shared row to race on.
 */
function withSessionLock<T>(userId: string, body: NasiTurnRequest, fn: () => Promise<T>): Promise<T> {
  return body.session ? withLock(`${userId}:${body.session}`, fn) : fn()
}

/**
 * The model an existing session last used, so a resumed turn re-resolves the same model instead of a fresh random pick.
 * Undefined for a brand-new session.
 */
export async function pinnedModelFor(userId: string, sessionId: string | undefined): Promise<string | undefined> {
  if (!sessionId) return undefined
  const [row] = await sql<
    { model: string }[]
  >`SELECT model FROM nasi_session WHERE id = ${sessionId} AND user_id = ${userId}`
  return row?.model
}

export async function runUserTurn(userId: string, body: NasiTurnRequest): Promise<NasiTurnResponse> {
  return withSessionLock(userId, body, async () => {
    const nasi = await openNasiFor({
      userId,
      pinnedModel: await pinnedModelFor(userId, body.session),
      language: body.language,
      client: clientOf(body)
    })
    try {
      return await nasi.turnBuffered(body)
    } finally {
      await nasi.close()
    }
  })
}

/** `/compact` for one of the user's sessions (a Telegram user's too, via `owner`), under the same lock as its turns. */
export async function compactUserSession(
  userId: string,
  body: { session: string; focus?: string },
  owner: string | null = null
) {
  return withLock(`${userId}:${body.session}`, async () => {
    const nasi = await openNasiFor({ userId, owner, pinnedModel: await pinnedModelFor(userId, body.session) })
    try {
      return await nasi.compact(body.session, body.focus || undefined)
    } finally {
      await nasi.close()
    }
  })
}

export function openUserTurnStream(userId: string, body: NasiTurnRequest) {
  const run = async function* () {
    const nasi = await openNasiFor({
      userId,
      pinnedModel: await pinnedModelFor(userId, body.session),
      language: body.language,
      client: clientOf(body)
    })
    // Also runs when the client goes away mid-stream, so a dropped turn never leaves its MCP connections open.
    try {
      return yield* nasi.turn(body)
    } finally {
      await nasi.close()
    }
  }
  return body.session ? withLockGenerator(`${userId}:${body.session}`, run) : run()
}
