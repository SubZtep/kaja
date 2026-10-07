import type { NasiTurnResponse, WidgetTurnRequest } from "@kaja/schema/nasi"
import { widgetVisitorOwner } from "@kaja/schema/store"
import { openNasiFor, pinnedModelFor } from "../nasi/chat"
import type { ResolvedWidgetKey } from "./auth"

export async function runWidgetTurn(widgetKey: ResolvedWidgetKey, body: WidgetTurnRequest): Promise<NasiTurnResponse> {
  const { visitorId, ...turnBody } = body
  const nasi = await openNasiFor({
    userId: widgetKey.userId,
    owner: widgetVisitorOwner(widgetKey.id, visitorId),
    pinnedModel: await pinnedModelFor(widgetKey.userId, turnBody.session),
    language: turnBody.language,
    // Skills only, never the owner's keyed tools; the widget's persona picks which skills.
    abilities: { skillsOnly: true }
  })
  try {
    return await nasi.turnBuffered({ ...turnBody, personaId: widgetKey.config.persona })
  } finally {
    await nasi.close()
  }
}
