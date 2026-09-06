import { createOpenAIClient, Nasi } from "@kaja/nasi"
import type { NasiTurnRequest, NasiTurnResponse } from "@kaja/schema/nasi"
import { isPublicHttpUrl } from "@kaja/shared"
import { env } from "../../core/env"
import { modelService } from "../../services"
import { userSqlitePath } from "./paths"
import { listPersonas } from "./personas"

export type ChatResolver = () => Promise<{ client: ReturnType<typeof createOpenAIClient>; model: string }>

let chatResolver: ChatResolver | undefined

export function setNasiChatResolver(resolver: ChatResolver | undefined) {
  chatResolver = resolver
}

async function defaultChatResolver() {
  const stub = env.NASI_STUB_MODEL
  if (stub) {
    return {
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

/** Shared by hosted (`/nasi/turn*`) and widget (`/widget/turn`) turns — same account SQLite file, `owner` distinguishes whose rows within it. */
export async function openNasiFor(opts: { userId: string; owner?: string | null }): Promise<Nasi> {
  const chat = await (chatResolver ?? defaultChatResolver)()
  const personas = listPersonas()
  return Nasi.open({
    dbPath: userSqlitePath(opts.userId),
    profile: "hosted",
    chat,
    personas,
    owner: opts.owner,
    promptContext: {
      environment: "You are Kaja hosted chat. You cannot read the user's disk, run a shell, or use MCP."
    }
  })
}

export async function runUserTurn(userId: string, body: NasiTurnRequest): Promise<NasiTurnResponse> {
  const nasi = await openNasiFor({ userId })
  return nasi.turnBuffered(body)
}

export async function openUserTurnStream(userId: string, body: NasiTurnRequest) {
  const nasi = await openNasiFor({ userId })
  return nasi.turn(body)
}
