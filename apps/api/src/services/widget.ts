import { createHash, randomBytes } from "node:crypto"
import type { Widget, WidgetGeneration, WidgetMe, WidgetTarget } from "@kaja/schema/api"
import { widgetGenerationSchema, widgetTargetSchema } from "@kaja/schema/api"
import type { SQL } from "bun"

const TOKEN_PREFIX = "kwt_"
/** Game transcripts stay small; a larger body is refused rather than stored. */
export const WIDGET_STATE_MAX_BYTES = 16 * 1024

type WidgetRow = {
  id: string
  user_id: string
  label: string
  intent: string
  model: string
  target: unknown
  token_prefix: string
  enabled: boolean
  draft_generation_id: string | null
  published_generation_id: string | null
  created_at: Date
  last_used_at: Date | null
}

type GenerationRow = {
  id: string
  widget_id: string
  source: string
  error: string | null
  prompt_version: number
  config_hash: string
  created_at: Date
}

export type ResolvedWidget = {
  id: string
  userId: string
  model: string
  intent: string
  target: WidgetTarget
  links: string[]
  enabled: boolean
}

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex")
}

function generation(row: GenerationRow): WidgetGeneration & { configHash: string } {
  const parsed = widgetGenerationSchema.parse({
    id: row.id,
    source: row.source,
    error: row.error,
    createdAt: row.created_at
  })
  return { ...parsed, configHash: row.config_hash }
}

/**
 * Widget principals: a secret token, a pinned model, generated source, and a small state bag per visitor.
 * Child widgets are a later mint of the same table (`parent_widget_id`); nothing writes that column yet.
 */
export class WidgetService {
  readonly #db: SQL

  constructor(db: SQL) {
    this.#db = db
  }

  /** Returns the raw token once. Only its hash is stored. */
  async create(
    userId: string,
    input: { label: string; intent: string; model: string; target: WidgetTarget }
  ): Promise<Widget & { rawToken: string }> {
    const rawToken = `${TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`
    const [row] = await this.#db<WidgetRow[]>`
      INSERT INTO widget (user_id, label, intent, model, target, token_prefix, token_hash)
      VALUES (${userId}, ${input.label}, ${input.intent}, ${input.model}, ${this.#db.json(input.target)},
              ${rawToken.slice(0, 12)}, ${hashToken(rawToken)})
      RETURNING *`
    const widget = await this.#assemble(row!)
    return { ...widget, rawToken }
  }

  async list(userId: string): Promise<Widget[]> {
    const rows = await this.#db<WidgetRow[]>`SELECT * FROM widget WHERE user_id = ${userId} ORDER BY created_at`
    return this.#assembleAll(rows)
  }

  async get(userId: string, id: string): Promise<Widget | null> {
    const [row] = await this.#db<WidgetRow[]>`SELECT * FROM widget WHERE id = ${id} AND user_id = ${userId}`
    return row ? this.#assemble(row) : null
  }

  /**
   * Patches the owner's widget. `behaviorChanged` is set when intent, model, or target moved, so the caller can
   * store a new draft without touching the published source.
   */
  async update(
    userId: string,
    id: string,
    patch: { label?: string; intent?: string; model?: string; target?: WidgetTarget }
  ): Promise<{ widget: Widget; behaviorChanged: boolean } | null> {
    const [current] = await this.#db<WidgetRow[]>`SELECT * FROM widget WHERE id = ${id} AND user_id = ${userId}`
    if (!current) return null
    const target = patch.target ?? widgetTargetSchema.parse(current.target)
    const intent = patch.intent ?? current.intent
    const model = patch.model ?? current.model
    const behaviorChanged =
      intent !== current.intent ||
      model !== current.model ||
      JSON.stringify(target) !== JSON.stringify(widgetTargetSchema.parse(current.target))
    await this.#db`
      UPDATE widget SET
        label = ${patch.label ?? current.label},
        intent = ${intent},
        model = ${model},
        target = ${this.#db.json(target)}
      WHERE id = ${id} AND user_id = ${userId}`
    const widget = await this.get(userId, id)
    return widget ? { widget, behaviorChanged } : null
  }

  async revoke(userId: string, id: string): Promise<boolean> {
    const result = await this.#db`UPDATE widget SET enabled = false WHERE id = ${id} AND user_id = ${userId}`
    return result.affectedRows > 0
  }

  /**
   * Directed link. Null when either widget is missing or they belong to different accounts. False when it already
   * exists.
   */
  async link(userId: string, fromId: string, toId: string): Promise<boolean | null> {
    if (fromId === toId) return null
    const rows = await this.#db<{ id: string }[]>`
      SELECT id FROM widget WHERE user_id = ${userId} AND id = ANY(${[fromId, toId]}::uuid[])`
    if (rows.length !== 2) return null
    const result = await this.#db`
      INSERT INTO widget_link (from_widget_id, to_widget_id) VALUES (${fromId}, ${toId})
      ON CONFLICT DO NOTHING`
    return result.affectedRows > 0
  }

  async unlink(userId: string, fromId: string, toId: string): Promise<boolean | null> {
    const owned = await this.#db<{ id: string }[]>`SELECT id FROM widget WHERE id = ${fromId} AND user_id = ${userId}`
    if (!owned[0]) return null
    const result = await this.#db`
      DELETE FROM widget_link WHERE from_widget_id = ${fromId} AND to_widget_id = ${toId}`
    return result.affectedRows > 0
  }

  /** The widget a raw token names, or null when the token is unknown or revoked. */
  async resolveByRawToken(rawToken: string): Promise<ResolvedWidget | null> {
    const [row] = await this.#db<WidgetRow[]>`
      SELECT * FROM widget WHERE token_hash = ${hashToken(rawToken)} AND enabled`
    if (!row) return null
    const links = await this.#linkIds([row.id])
    return {
      id: row.id,
      userId: row.user_id,
      model: row.model,
      intent: row.intent,
      target: widgetTargetSchema.parse(row.target),
      links: links.get(row.id) ?? [],
      enabled: row.enabled
    }
  }

  /** Label is not on {@link ResolvedWidget}; this reads the row. */
  async describe(widgetId: string): Promise<WidgetMe | null> {
    const [row] = await this.#db<WidgetRow[]>`SELECT * FROM widget WHERE id = ${widgetId} AND enabled`
    if (!row) return null
    const links = await this.#linkIds([row.id])
    return {
      id: row.id,
      label: row.label,
      intent: row.intent,
      model: row.model,
      target: widgetTargetSchema.parse(row.target),
      links: links.get(row.id) ?? [],
      publishedGenerationId: row.published_generation_id
    }
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.#db`UPDATE widget SET last_used_at = NOW() WHERE id = ${id}`
  }

  /** Widgets that link to this one, same owner. */
  async inbound(userId: string, widgetId: string): Promise<string[]> {
    const rows = await this.#db<{ from_widget_id: string }[]>`
      SELECT l.from_widget_id FROM widget_link l
      JOIN widget w ON w.id = l.from_widget_id
      WHERE l.to_widget_id = ${widgetId} AND w.user_id = ${userId}`
    return rows.map(row => row.from_widget_id)
  }

  /** Stores a draft (with its config hash, see {@link draftHash}) and drops the previous draft row unless published. */
  async saveDraft(
    widgetId: string,
    draft: { source: string; error: string | null; promptVersion: number; configHash: string }
  ): Promise<void> {
    const [previous] = await this.#db<{ draft_generation_id: string | null; published_generation_id: string | null }[]>`
      SELECT draft_generation_id, published_generation_id FROM widget WHERE id = ${widgetId}`
    if (!previous) return
    const [row] = await this.#db<{ id: string }[]>`
      INSERT INTO widget_generation (widget_id, source, error, prompt_version, config_hash)
      VALUES (${widgetId}, ${draft.source}, ${draft.error}, ${draft.promptVersion}, ${draft.configHash})
      RETURNING id`
    await this.#db`UPDATE widget SET draft_generation_id = ${row!.id} WHERE id = ${widgetId}`
    const old = previous.draft_generation_id
    if (old && old !== previous.published_generation_id) await this.#db`DELETE FROM widget_generation WHERE id = ${old}`
  }

  async draftHash(widgetId: string): Promise<string | null> {
    const [row] = await this.#db<{ config_hash: string; error: string | null }[]>`
      SELECT g.config_hash, g.error FROM widget w
      JOIN widget_generation g ON g.id = w.draft_generation_id
      WHERE w.id = ${widgetId}`
    return row && !row.error ? row.config_hash : null
  }

  async publish(userId: string, id: string): Promise<Widget | null> {
    const widget = await this.get(userId, id)
    if (!widget?.draft || widget.draft.error || !widget.draft.source) return null
    const result = await this.#db`
      UPDATE widget SET published_generation_id = draft_generation_id, draft_generation_id = NULL
      WHERE id = ${id} AND user_id = ${userId} AND draft_generation_id = ${widget.draft.id}`
    if (result.affectedRows === 0) return null
    // The replaced generation is no longer reachable from either pointer
    if (widget.published) await this.#db`DELETE FROM widget_generation WHERE id = ${widget.published.id}`
    return this.get(userId, id)
  }

  async discardDraft(userId: string, id: string): Promise<Widget | null> {
    const [row] = await this.#db<{ draft_generation_id: string | null; published_generation_id: string | null }[]>`
      SELECT draft_generation_id, published_generation_id FROM widget WHERE id = ${id} AND user_id = ${userId}`
    if (!row) return null
    if (!row.draft_generation_id) return this.get(userId, id)
    await this.#db`UPDATE widget SET draft_generation_id = NULL WHERE id = ${id}`
    if (row.draft_generation_id !== row.published_generation_id)
      await this.#db`DELETE FROM widget_generation WHERE id = ${row.draft_generation_id}`
    return this.get(userId, id)
  }

  async publishedSource(widgetId: string): Promise<{ generationId: string; source: string } | null> {
    const [row] = await this.#db<{ id: string; source: string; error: string | null }[]>`
      SELECT g.id, g.source, g.error FROM widget w
      JOIN widget_generation g ON g.id = w.published_generation_id
      WHERE w.id = ${widgetId} AND w.enabled`
    if (!row || row.error || !row.source) return null
    return { generationId: row.id, source: row.source }
  }

  async getState(widgetId: string, visitorId: string): Promise<unknown> {
    const [row] = await this.#db<{ state: unknown }[]>`
      SELECT state FROM widget_state WHERE widget_id = ${widgetId} AND visitor_id = ${visitorId}`
    return row?.state ?? null
  }

  /** False when the JSON is over the cap. */
  async putState(widgetId: string, visitorId: string, state: unknown): Promise<boolean> {
    const encoded = JSON.stringify(state)
    if (encoded === undefined || Buffer.byteLength(encoded) > WIDGET_STATE_MAX_BYTES) return false
    await this.#db`
      INSERT INTO widget_state (widget_id, visitor_id, state)
      VALUES (${widgetId}, ${visitorId}, ${this.#db.json(state as object)})
      ON CONFLICT (widget_id, visitor_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`
    return true
  }

  async recordCall(
    widgetId: string,
    call: { kind: "chat" | "generate"; model: string; promptTokens: number; completionTokens: number }
  ): Promise<void> {
    await this.#db`
      INSERT INTO widget_call (widget_id, kind, model, prompt_tokens, completion_tokens)
      VALUES (${widgetId}, ${call.kind}, ${call.model}, ${call.promptTokens}, ${call.completionTokens})`
  }

  async #assemble(row: WidgetRow): Promise<Widget> {
    const [widget] = await this.#assembleAll([row])
    return widget!
  }

  async #assembleAll(rows: WidgetRow[]): Promise<Widget[]> {
    if (rows.length === 0) return []
    const generationIds = rows.flatMap(row => [row.draft_generation_id, row.published_generation_id].filter(Boolean))
    const generations = new Map<string, WidgetGeneration>()
    if (generationIds.length > 0) {
      const found = await this.#db<GenerationRow[]>`
        SELECT * FROM widget_generation WHERE id = ANY(${generationIds}::uuid[])`
      for (const row of found) {
        const { configHash: _, ...parsed } = generation(row)
        generations.set(row.id, parsed)
      }
    }
    const links = await this.#linkIds(rows.map(row => row.id))
    return rows.map(row => ({
      id: row.id,
      label: row.label,
      intent: row.intent,
      model: row.model,
      target: widgetTargetSchema.parse(row.target),
      tokenPrefix: row.token_prefix,
      enabled: row.enabled,
      links: links.get(row.id) ?? [],
      draft: row.draft_generation_id ? (generations.get(row.draft_generation_id) ?? null) : null,
      published: row.published_generation_id ? (generations.get(row.published_generation_id) ?? null) : null,
      createdAt: new Date(row.created_at),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null
    }))
  }

  async #linkIds(widgetIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>(widgetIds.map(id => [id, []]))
    if (widgetIds.length > 0) {
      const rows = await this.#db<{ from_widget_id: string; to_widget_id: string }[]>`
        SELECT from_widget_id, to_widget_id FROM widget_link
        WHERE from_widget_id = ANY(${widgetIds}::uuid[])
        ORDER BY to_widget_id`
      for (const row of rows) map.get(row.from_widget_id)?.push(row.to_widget_id)
    }
    return map
  }
}
