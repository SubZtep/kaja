import {
  ASK_USER_TOOL,
  createOpenAIClient,
  Nasi,
  replyLanguageInstructionFor,
  resolveContextWindow,
  setDatasetLoaders
} from "@kaja/nasi"
import type { Persona } from "@kaja/schema/abilities"
import type { NasiTurnRequest, NasiTurnResponse } from "@kaja/schema/nasi"
import { isPublicHttpUrl } from "@kaja/shared"
import { pool } from "../../core/db"
import { env } from "../../core/env"
import { withLock, withLockGenerator } from "../../core/lock"
import { abilityService, modelService } from "../../services"
import { type CloudAbilitySource, createPostgresAbilityStore } from "./pg-abilities"
import { createPostgresStore } from "./pg-store"

export type ChatResolver = () => Promise<{
  client: ReturnType<typeof createOpenAIClient>
  model: string
  contextWindow?: number
}>

let chatResolver: ChatResolver | undefined

export function setNasiChatResolver(resolver: ChatResolver | undefined) {
  chatResolver = resolver
}

/** Reuses an existing session's model so it doesn't change mid-conversation; falls back to a fresh random pick if that model was since disabled/deleted (or there's no pinned model yet, i.e. a new session). */
export async function resolveModelWithProvider(pinnedModel?: string) {
  return pinnedModel
    ? ((await modelService.getModelWithProviderByName(pinnedModel)) ??
        (await modelService.getRandomModelWithProvider()))
    : await modelService.getRandomModelWithProvider()
}

async function defaultChatResolver(pinnedModel?: string) {
  const stub = env.NASI_STUB_MODEL
  if (stub) {
    return {
      // Port 9 is the RFC 863 discard port — nothing listens there, so a real call fails fast instead of silently hitting something else.
      client: createOpenAIClient({ baseURL: "http://127.0.0.1:9", apiKey: "stub" }),
      model: stub
    }
  }
  const result = await resolveModelWithProvider(pinnedModel)
  if (!result) throw new Error("no_model")
  if (!isPublicHttpUrl(result.provider.baseUrl)) throw new Error("unsafe_model_url")
  const window = await resolveContextWindow({
    baseUrl: result.provider.baseUrl,
    apiKey: result.provider.apiKey ?? undefined,
    model: result.model.model,
    contextWindow: result.model.contextWindow ?? undefined
  })
  return {
    client: createOpenAIClient({
      baseURL: result.provider.baseUrl,
      apiKey: result.provider.apiKey ?? "unused"
    }),
    model: result.model.model,
    contextWindow: window.tokens
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
  return {
    client: createOpenAIClient({ baseURL: target.baseUrl, apiKey: target.apiKey ?? "unused" }),
    model: target.model,
    contextWindow: (await resolveContextWindow(target)).tokens
  }
}

/** Host-neutral replacement for the CLI's terminal-flavored ask_user contract — cloud chat is a normal message UI, not a terminal that blocks on tool calls. */
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
  `just state the result and stop.`

// dataset_info and the "About the user" section read the marketplace's datasets from the ability table.
setDatasetLoaders({
  loadDatasets: () => abilityService.datasets(),
  loadDataset: async topic => (await abilityService.datasets()).get(topic)
})

let fetchProxyOverride: string | undefined

/** Test seam: forces the proxy `nasiToolDeps` reports, so a test can exercise proxy-gated tools without a real proxy. Pass undefined to restore the env value. */
export function setNasiFetchProxyOverride(proxy: string | undefined) {
  fetchProxyOverride = proxy
}

/** Tool deps every cloud turn runs with. `fetchProxy` unset leaves `fetch_url` out of the cloud tool set entirely — cloud fetches egress from the server, so they go through a proxy or not at all. HTTP tool abilities use it too when set, and otherwise go direct (their hosts are fixed by reviewed manifests, and private addresses are refused). */
export function nasiToolDeps() {
  return { fetchProxy: fetchProxyOverride ?? env.WEB_PROXY }
}

/** Shared by cloud (`/nasi/turn*`) and widget (`/widget/turn`) turns — same account, `owner` distinguishes whose rows within it. The caller closes it after the turn (its MCP connections). */
export async function openNasiFor(opts: {
  userId: string
  owner?: string | null
  pinnedModel?: string
  language?: string
  /** Whose abilities the turn gets; defaults to the user's own selections and keys (a widget passes its key's skill list). */
  abilities?: CloudAbilitySource
  /** The caller is the terminal, which runs `read_file`/`list_files` on the user's machine; the widget and Telegram have no such client, so they leave it off. */
  clientTools?: boolean
  /** How replies should read where they're shown (see `PromptContext.channelInstruction`). */
  channelInstruction?: string
}): Promise<Nasi> {
  const [chat, summarizer] = await Promise.all([
    chatResolver ? chatResolver() : defaultChatResolver(opts.pinnedModel),
    resolveSummarizer()
  ])
  const source = opts.abilities ?? { userId: opts.userId }
  const personas = await personasFor(source)
  // Only the user's own turns get their keys; a widget's skills-only source never needs one.
  const keys = "userId" in source ? await abilityService.keysForUser(source.userId) : new Map<string, string>()
  return Nasi.open({
    store: createPostgresStore(pool, opts.userId),
    chat,
    summarizer,
    personas,
    owner: opts.owner,
    clientTools: opts.clientTools === true,
    deps: nasiToolDeps(),
    abilities: createPostgresAbilityStore(source),
    abilityKey: name => keys.get(name),
    promptContext: {
      environment:
        "You are Kaja cloud chat. " +
        (opts.clientTools
          ? "read_file and list_files run on the user's own machine, scoped to their current directory — "
          : "You have no access to the user's machine — ") +
        "you cannot run a shell. " +
        "Use only the tools you were given — if a tool you'd want isn't there, say so instead of guessing.",
      askUserInstruction: CLOUD_ASK_USER_INSTRUCTION,
      channelInstruction: opts.channelInstruction,
      replyLanguageInstruction: opts.language ? replyLanguageInstructionFor(opts.language) : undefined
    }
  })
}

/** The turn's roster: the user's own personas, or for a widget the whole catalog (its key's persona is where a turn starts). */
function personasFor(source: CloudAbilitySource): Promise<Persona[]> {
  return "userId" in source ? abilityService.personasForUser(source.userId) : abilityService.personaCatalog()
}

/** Serializes turns on an existing session so overlapping requests (retries, duplicate tabs) can't race the read-modify-write around session persistence; a new session (no id yet) has no shared row to race on. */
function withSessionLock<T>(userId: string, body: NasiTurnRequest, fn: () => Promise<T>): Promise<T> {
  return body.session ? withLock(`${userId}:${body.session}`, fn) : fn()
}

/** The model an existing session last used, so a resumed turn re-resolves the same model instead of a fresh random pick. Undefined for a brand-new session. */
export async function pinnedModelFor(userId: string, sessionId: string | undefined): Promise<string | undefined> {
  if (!sessionId) return undefined
  const result = await pool.query<{ model: string }>("SELECT model FROM nasi_session WHERE id = $1 AND user_id = $2", [
    sessionId,
    userId
  ])
  return result.rows[0]?.model
}

export async function runUserTurn(userId: string, body: NasiTurnRequest): Promise<NasiTurnResponse> {
  return withSessionLock(userId, body, async () => {
    const nasi = await openNasiFor({
      userId,
      pinnedModel: await pinnedModelFor(userId, body.session),
      language: body.language,
      clientTools: true
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
      clientTools: true
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
