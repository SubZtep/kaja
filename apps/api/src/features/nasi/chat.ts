import { createOpenAIClient, Nasi } from "@kaja/nasi"
import type { NasiTurnRequest, NasiTurnResponse } from "@kaja/schema/nasi"
import { isPublicHttpUrl } from "@kaja/shared"
import { modelService, personaService } from "../../services"
import { userSqlitePath } from "./paths"

export type ChatResolver = () => Promise<{ client: ReturnType<typeof createOpenAIClient>; model: string }>

let chatResolver: ChatResolver | undefined

export function setNasiChatResolver(resolver: ChatResolver | undefined) {
  chatResolver = resolver
}

async function defaultChatResolver() {
  const stub = process.env.NASI_STUB_MODEL
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

async function openNasiForUser(userId: string): Promise<Nasi> {
  const chat = await (chatResolver ?? defaultChatResolver)()
  const rows = await personaService.listEnabled()
  const personas = rows.map(row => ({
    id: row.personaId,
    label: row.label,
    instructions: row.instructions ?? undefined,
    when: row.when ?? undefined
  }))
  return Nasi.open({
    dbPath: userSqlitePath(userId),
    profile: "hosted",
    chat,
    personas,
    promptContext: {
      environment: "You are Kaja hosted chat. You cannot read the user's disk, run a shell, or use MCP."
    }
  })
}

export async function runUserTurn(userId: string, body: NasiTurnRequest): Promise<NasiTurnResponse> {
  const nasi = await openNasiForUser(userId)
  return nasi.turnBuffered(body)
}

export async function openUserTurnStream(userId: string, body: NasiTurnRequest) {
  const nasi = await openNasiForUser(userId)
  return nasi.turn(body)
}
