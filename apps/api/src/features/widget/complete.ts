import { NoModelError } from "@kaja/nasi"
import type { AiChatMessage } from "@kaja/schema/api"
import { widgetService } from "../../services"
import { resolveWidgetChat } from "../nasi/chat"

export type WidgetCompletion = { message: string; promptTokens: number; completionTokens: number }

/**
 * One pinned-model completion for a widget. The model name sent to the provider is the widget's, never one from the
 * caller. A test resolver replaces the client; the model argument is still the pin.
 */
export async function completeWidgetChat(pinnedModel: string, messages: AiChatMessage[]): Promise<WidgetCompletion> {
  const resolved = await resolveWidgetChat(pinnedModel)
  if (!resolved) throw new NoModelError()
  const completion = await resolved.client.chat.completions.create({
    model: pinnedModel,
    messages,
    stream: false
  })
  const message = completion.choices[0]?.message?.content ?? ""
  return {
    message,
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0
  }
}

/** Records a completion against the widget. */
export async function recordWidgetChat(
  widgetId: string,
  kind: "chat" | "generate",
  model: string,
  usage: Pick<WidgetCompletion, "promptTokens" | "completionTokens">
): Promise<void> {
  await widgetService.recordCall(widgetId, {
    kind,
    model,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens
  })
}
