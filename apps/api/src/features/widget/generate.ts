import { createHash } from "node:crypto"
import type { Widget } from "@kaja/schema/api"
import { withLock } from "../../core/lock"
import { widgetService } from "../../services"
import { completeWidgetChat, recordWidgetChat } from "./complete"
import { WIDGET_PROMPT_VERSION, widgetSourcePrompt } from "./prompt"
import { extractSource, sourceProblem } from "./source"

function draftConfigHash(widget: Widget): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        intent: widget.intent,
        model: widget.model,
        target: widget.target,
        links: [...widget.links].sort(),
        promptVersion: WIDGET_PROMPT_VERSION
      })
    )
    .digest("hex")
}

/**
 * Asks the widget's model for source and stores it as a draft. The published source stays until publish.
 * `force` regenerates even when the draft already matches this config.
 */
export async function generateDraft(userId: string, widgetId: string, force = false): Promise<Widget | null> {
  return withLock(`widget-draft:${widgetId}`, () => writeDraft(userId, widgetId, force))
}

async function writeDraft(userId: string, widgetId: string, force: boolean): Promise<Widget | null> {
  const widget = await widgetService.get(userId, widgetId)
  if (!widget) return null
  const hash = draftConfigHash(widget)
  if (!force && (await widgetService.draftHash(widgetId)) === hash) return widget

  const links = []
  for (const linkId of widget.links) {
    const linked = await widgetService.get(userId, linkId)
    if (linked) links.push({ label: linked.label, intent: linked.intent, target: linked.target })
  }
  let source = ""
  let error: string | null
  try {
    const completion = await completeWidgetChat(widget.model, [
      { role: "user", content: widgetSourcePrompt({ ...widget, links }) }
    ])
    await recordWidgetChat(widgetId, "generate", widget.model, completion)
    const extracted = extractSource(completion.message, widget.target.kind)
    error = extracted ? (sourceProblem(extracted) ?? null) : "The model reply had no source"
    source = error ? "" : extracted!
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "Generation failed"
    console.warn("widget generation failed", { widgetId, error })
  }
  await widgetService.saveDraft(widgetId, {
    source,
    error,
    promptVersion: WIDGET_PROMPT_VERSION,
    configHash: hash
  })
  return widgetService.get(userId, widgetId)
}

/** Regenerates this widget and every widget that links to it, so a changed intent reaches both sides. */
export async function regenerateAffected(userId: string, widgetId: string): Promise<void> {
  await generateDraft(userId, widgetId, true)
  for (const fromId of await widgetService.inbound(userId, widgetId)) await generateDraft(userId, fromId, true)
}
