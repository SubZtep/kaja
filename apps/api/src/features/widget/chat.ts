import type { NasiTurnResponse, WidgetTurnRequest } from "@kaja/schema/nasi"
import { widgetVisitorOwner } from "@kaja/schema/store"
import { openNasiFor } from "../nasi/chat"
import type { ResolvedWidgetKey } from "./auth"

export async function runWidgetTurn(widgetKey: ResolvedWidgetKey, body: WidgetTurnRequest): Promise<NasiTurnResponse> {
  const { visitorId, ...turnBody } = body
  const nasi = await openNasiFor({
    userId: widgetKey.userId,
    owner: widgetVisitorOwner(widgetKey.id, visitorId)
  })
  return nasi.turnBuffered({ ...turnBody, personaId: widgetKey.persona ?? undefined })
}
