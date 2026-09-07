import { createOpenAIClient, Nasi } from "@kaja/nasi"
import type { NasiTurnRequest, NasiTurnResponse } from "@kaja/schema/nasi"
import { isPublicHttpUrl } from "@kaja/shared"
import { pool } from "../../core/db"
import { env } from "../../core/env"
import { withLock, withLockGenerator } from "../../core/lock"
import { modelService } from "../../services"
import { listPersonas } from "./personas"
import { createPostgresStore } from "./pg-store"

export type ChatResolver = () => Promise<{ client: ReturnType<typeof createOpenAIClient>; model: string }>

let chatResolver: ChatResolver | undefined

export function setNasiChatResolver(resolver: ChatResolver | undefined) {
  chatResolver = resolver
}

async function defaultChatResolver() {
  const stub = env.NASI_STUB_MODEL
  if (stub) {
    return {
      // Port 9 is the RFC 863 discard port — nothing listens there, so a real call fails fast instead of silently hitting something else.
      client: createOpenAIClient({ baseURL: "http://127.0.0.1:9", apiKey: "stub" }),
      model: stub
    }
  }
  const result = await modelService.getRandomModelWithProvider()
  if (!result) throw new Error("no_model")
  if (!isPublicHttpUrl(result.provider.baseUrl)) throw new Error("unsafe_model_url")
  return {
    client: createOpenAIClient({
      baseURL: result.provider.baseUrl,
      apiKey: result.provider.apiKey ?? "unused"
    }),
    model: result.model.model
  }
}

/** Shared by hosted (`/nasi/turn*`) and widget (`/widget/turn`) turns — same account, `owner` distinguishes whose rows within it. */
export async function openNasiFor(opts: { userId: string; owner?: string | null }): Promise<Nasi> {
  const chat = await (chatResolver ?? defaultChatResolver)()
  const personas = listPersonas()
  return Nasi.open({
    store: createPostgresStore(pool, opts.userId),
    chat,
    personas,
    owner: opts.owner,
    promptContext: {
      environment: "You are Kaja hosted chat. You cannot read the user's disk, run a shell, or use MCP."
    }
  })
}

/** Serializes turns on an existing session so overlapping requests (retries, duplicate tabs) can't race the read-modify-write around session persistence; a new session (no id yet) has no shared row to race on. */
function withSessionLock<T>(userId: string, body: NasiTurnRequest, fn: () => Promise<T>): Promise<T> {
  return body.session ? withLock(`${userId}:${body.session}`, fn) : fn()
}

export async function runUserTurn(userId: string, body: NasiTurnRequest): Promise<NasiTurnResponse> {
  return withSessionLock(userId, body, async () => {
    const nasi = await openNasiFor({ userId })
    return nasi.turnBuffered(body)
  })
}

export function openUserTurnStream(userId: string, body: NasiTurnRequest) {
  const run = async function* () {
    const nasi = await openNasiFor({ userId })
    return yield* nasi.turn(body)
  }
  return body.session ? withLockGenerator(`${userId}:${body.session}`, run) : run()
}
