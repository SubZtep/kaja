import { createOpenAIClient, Nasi } from "@kaja/nasi"
import type { NasiTurnRequest, NasiTurnResponse } from "@kaja/schema/nasi"
import { isPublicHttpUrl } from "@kaja/shared"
import { modelService } from "../../services"
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

export async function runUserTurn(userId: string, body: NasiTurnRequest): Promise<NasiTurnResponse> {
  const chat = await (chatResolver ?? defaultChatResolver)()
  const nasi = await Nasi.open({
    dbPath: userSqlitePath(userId),
    profile: "hosted",
    chat,
    promptContext: {
      environment: "You are Kaja hosted chat. You cannot read the user's disk, run a shell, or use MCP."
    }
  })
  return nasi.turnBuffered(body)
}
