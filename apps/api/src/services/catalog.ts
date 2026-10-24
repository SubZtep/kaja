import { createHash } from "node:crypto"
import {
  type CatalogModel,
  type CatalogProvider,
  type CatalogSyncResult,
  type CatalogSyncStatus,
  type CreateCatalogModelRequest,
  type CreateCatalogProviderRequest,
  type Model,
  type ModelTask,
  PUBLIC_CATALOG_VERSION,
  type PublicCatalog,
  type UpdateCatalogModelRequest,
  type UpdateCatalogProviderRequest
} from "@kaja/schema/api"
import type { SQL } from "bun"
import { z } from "zod"
import { withLock } from "../core/lock"
import { reportError } from "../core/report"

/** The public models.dev registry: every provider, keyed by id, with its models keyed by id. */
export const MODELS_DEV_URL = "https://models.dev/api.json"

// The subset of models.dev the sync reads; everything else is ignored, and a model that doesn't fit is skipped.
const modelsDevModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  modalities: z.object({ input: z.array(z.string()), output: z.array(z.string()) }).optional(),
  limit: z.object({ context: z.number().optional() }).optional()
})

const modelsDevProviderSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  api: z.string().optional(),
  doc: z.string().optional(),
  npm: z.string().optional(),
  models: z.record(z.string(), z.unknown())
})

type SyncedModel = {
  model: string
  name: string | null
  tasks: ModelTask[]
  contextWindow: number | null
  images: boolean
  status: "deprecated" | null
}

/** The tasks a models.dev model can serve; none for kinds Kaja has no task for (video, realtime). */
export function tasksFor(model: z.infer<typeof modelsDevModelSchema>): ModelTask[] {
  const input = model.modalities?.input ?? ["text"]
  const output = model.modalities?.output ?? ["text"]
  switch (model.type) {
    case "embedding":
      return ["embedding"]
    case "transcription":
      return ["stt"]
    case "speech":
      return ["tts"]
    case "image":
      return ["image-generation"]
    case "reranking":
      return ["rerank"]
    case undefined:
    case "chat":
      if (!output.includes("text")) return []
      return input.includes("image") ? ["chat", "summarize", "vision"] : ["chat", "summarize"]
    default:
      return []
  }
}

function toSyncedModel(raw: unknown): SyncedModel | undefined {
  const parsed = modelsDevModelSchema.safeParse(raw)
  if (!parsed.success) return undefined
  const model = parsed.data
  const tasks = tasksFor(model)
  if (tasks.length === 0) return undefined
  const context = model.limit?.context
  return {
    model: model.id,
    name: model.name ?? null,
    tasks,
    contextWindow: context && Number.isInteger(context) && context > 0 ? context : null,
    images: model.modalities?.input.includes("image") ?? false,
    status: model.status === "deprecated" ? "deprecated" : null
  }
}

const sameTasks = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((task, index) => task === b[index])

type ProviderRow = {
  id: string
  slug: string
  name: string
  kind: CatalogProvider["kind"]
  api_url: string | null
  base_url: string | null
  doc: string | null
  npm: string | null
  note: string | null
  position: number
  listed: boolean
  source: CatalogProvider["source"]
  synced_at: Date | null
  created_at: Date
  updated_at: Date
  model_count?: number
  default_tasks?: ModelTask[]
}

type ModelRow = {
  id: string
  provider_id: string
  model: string
  name: string | null
  tasks: ModelTask[]
  tasks_edited: boolean
  default_tasks: ModelTask[]
  context_window: number | null
  images: boolean
  status: CatalogModel["status"]
  source: CatalogModel["source"]
  synced_at: Date | null
  created_at: Date
  updated_at: Date
}

/**
 * The public provider catalog: models.dev's providers and models, synced daily, plus what the admin adds and curates
 * (which providers are listed, their order and address, each task's default model). Synced rows are never deleted: a
 * model models.dev drops is marked removed, so a default pointing at it shows up in the admin instead of vanishing.
 */
export class CatalogService {
  readonly #db: SQL
  readonly #fetch: typeof fetch
  readonly #url: string
  #public: { body: PublicCatalog; etag: string } | undefined

  constructor(db: SQL, fetchImpl: typeof fetch = fetch, url = MODELS_DEV_URL) {
    this.#db = db
    this.#fetch = fetchImpl
    this.#url = url
  }

  /** `GET /config/catalog`'s body and ETag, cached until the next sync or admin write. */
  async publicCatalog(): Promise<{ body: PublicCatalog; etag: string }> {
    if (this.#public) return this.#public
    const providers = await this.#db<ProviderRow[]>`
      SELECT * FROM catalog_provider
      WHERE listed AND COALESCE(base_url, api_url) IS NOT NULL
      ORDER BY position, name`
    const models = await this.#db<ModelRow[]>`
      SELECT * FROM catalog_model
      WHERE provider_id = ANY(${providers.map(provider => provider.id)}::uuid[])
        AND (status IS NULL OR cardinality(default_tasks) > 0)
      ORDER BY cardinality(default_tasks) DESC, model`
    const byProvider = Map.groupBy(models, model => model.provider_id)
    const body: PublicCatalog = {
      version: PUBLIC_CATALOG_VERSION,
      providers: providers.flatMap(provider => {
        const served = byProvider.get(provider.id) ?? []
        if (served.length === 0) return []
        return [
          {
            id: provider.slug,
            name: provider.name,
            kind: provider.kind,
            base_url: (provider.base_url ?? provider.api_url)!,
            note: provider.note,
            doc: provider.doc,
            models: served.map(model => ({
              model: model.model,
              name: model.name,
              tasks: model.tasks,
              default_tasks: model.default_tasks,
              context_window: model.context_window,
              images: model.images
            }))
          }
        ]
      })
    }
    const etag = `"${createHash("sha256").update(JSON.stringify(body)).digest("hex")}"`
    this.#public = { body, etag }
    return this.#public
  }

  async listProviders(): Promise<CatalogProvider[]> {
    const rows = await this.#db<ProviderRow[]>`
      SELECT p.*,
        (SELECT count(*)::int FROM catalog_model m WHERE m.provider_id = p.id AND m.status IS DISTINCT FROM 'removed')
          AS model_count,
        (SELECT COALESCE(array_agg(DISTINCT t), '{}') FROM catalog_model m, unnest(m.default_tasks) t
          WHERE m.provider_id = p.id) AS default_tasks
      FROM catalog_provider p
      ORDER BY p.listed DESC, p.position, p.name`
    return rows.map(row => this.#rowToProvider(row))
  }

  async createProvider(input: CreateCatalogProviderRequest): Promise<CatalogProvider | "taken"> {
    const [row] = await this.#db<ProviderRow[]>`
      INSERT INTO catalog_provider (slug, name, kind, base_url, note, source, position)
      VALUES (${input.slug}, ${input.name}, ${input.kind}, ${input.baseUrl}, ${input.note}, 'admin',
              (SELECT COALESCE(max(position), 0) + 1 FROM catalog_provider WHERE listed))
      ON CONFLICT (slug) DO NOTHING
      RETURNING *, 0 AS model_count, '{}'::text[] AS default_tasks`
    if (!row) return "taken"
    this.#invalidate()
    return this.#rowToProvider(row)
  }

  async updateProvider(id: string, input: UpdateCatalogProviderRequest): Promise<CatalogProvider | null> {
    const [row] = await this.#db<ProviderRow[]>`
      UPDATE catalog_provider
      SET name = COALESCE(${input.name ?? null}, name),
          kind = COALESCE(${input.kind ?? null}, kind),
          base_url = CASE WHEN ${input.baseUrl !== undefined} THEN ${input.baseUrl ?? null} ELSE base_url END,
          note = CASE WHEN ${input.note !== undefined} THEN ${input.note ?? null} ELSE note END,
          position = COALESCE(${input.position ?? null}::int, position),
          listed = COALESCE(${input.listed ?? null}::boolean, listed),
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING id`
    if (!row) return null
    this.#invalidate()
    return (await this.listProviders()).find(provider => provider.id === id) ?? null
  }

  /** A synced provider comes back (unlisted) on the next sync; an admin-added one is gone for good. */
  async deleteProvider(id: string): Promise<boolean> {
    const result = await this.#db`DELETE FROM catalog_provider WHERE id = ${id}`
    this.#invalidate()
    return result.affectedRows > 0
  }

  async listModels(providerId: string): Promise<CatalogModel[]> {
    const rows = await this.#db<ModelRow[]>`
      SELECT * FROM catalog_model WHERE provider_id = ${providerId}
      ORDER BY cardinality(default_tasks) DESC, status NULLS FIRST, model`
    return rows.map(row => this.#rowToModel(row))
  }

  async createModel(providerId: string, input: CreateCatalogModelRequest): Promise<CatalogModel | "taken" | null> {
    const [provider] = await this.#db<{ id: string }[]>`SELECT id FROM catalog_provider WHERE id = ${providerId}`
    if (!provider) return null
    const [row] = await this.#db<ModelRow[]>`
      INSERT INTO catalog_model (provider_id, model, name, tasks, tasks_edited, context_window, images, source)
      VALUES (${providerId}, ${input.model}, ${input.name}, ${input.tasks}, true, ${input.contextWindow},
              ${input.images}, 'admin')
      ON CONFLICT (provider_id, model) DO NOTHING
      RETURNING *`
    if (!row) return "taken"
    this.#invalidate()
    return this.#rowToModel(row)
  }

  /** `bad_default`: a default task the model doesn't (or no longer would) serve. */
  async updateModel(id: string, input: UpdateCatalogModelRequest): Promise<CatalogModel | "bad_default" | null> {
    return this.#db.begin(async tx => {
      const [current] = await tx<ModelRow[]>`SELECT * FROM catalog_model WHERE id = ${id} FOR UPDATE`
      if (!current) return null
      const tasks = input.tasks ?? current.tasks
      const defaults = input.defaultTasks ?? current.default_tasks.filter(task => tasks.includes(task))
      if (defaults.some(task => !tasks.includes(task))) return "bad_default"

      // One default per provider and task: whatever this model takes, its siblings give up.
      if (input.defaultTasks?.length)
        await tx`
          UPDATE catalog_model
          SET default_tasks = ARRAY(SELECT unnest(default_tasks) EXCEPT SELECT unnest(${defaults}::text[])),
              updated_at = NOW()
          WHERE provider_id = ${current.provider_id} AND id <> ${id} AND default_tasks && ${defaults}::text[]`
      const [row] = await tx<ModelRow[]>`
        UPDATE catalog_model
        SET name = CASE WHEN ${input.name !== undefined} THEN ${input.name ?? null} ELSE name END,
            tasks = ${tasks},
            tasks_edited = tasks_edited OR ${input.tasks !== undefined},
            default_tasks = ${defaults},
            context_window = CASE WHEN ${input.contextWindow !== undefined} THEN ${input.contextWindow ?? null}::int
                                  ELSE context_window END,
            images = COALESCE(${input.images ?? null}::boolean, images),
            updated_at = NOW()
        WHERE id = ${id}
        RETURNING *`
      this.#invalidate()
      return this.#rowToModel(row!)
    })
  }

  async deleteModel(id: string): Promise<boolean> {
    const result = await this.#db`DELETE FROM catalog_model WHERE id = ${id}`
    this.#invalidate()
    return result.affectedRows > 0
  }

  /**
   * Copies a catalog model into the cloud's own fleet (`provider`/`model`), disabled and not free until the admin sets
   * its key and switches it on. The fleet provider is found or made by the catalog slug.
   */
  async addToFleet(id: string): Promise<{ modelId: string } | "no_address" | "exists" | null> {
    return this.#db.begin(async tx => {
      const [row] = await tx<(ModelRow & { slug: string; address: string | null })[]>`
        SELECT m.*, p.slug, COALESCE(p.base_url, p.api_url) AS address
        FROM catalog_model m JOIN catalog_provider p ON p.id = m.provider_id
        WHERE m.id = ${id}`
      if (!row) return null
      if (!row.address || !URL.canParse(row.address)) return "no_address"
      const tasks: Model["tasks"] = row.tasks.length > 0 ? row.tasks : ["chat"]
      const [provider] = await tx<{ id: string }[]>`
        INSERT INTO provider (name, base_url) VALUES (${row.slug}, ${row.address})
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id`
      const [existing] = await tx`SELECT 1 FROM model WHERE provider_id = ${provider!.id} AND model = ${row.model}`
      if (existing) return "exists"
      const [model] = await tx<{ id: string }[]>`
        INSERT INTO model (provider_id, model, tasks, enabled, free, context_window, images)
        VALUES (${provider!.id}, ${row.model}, ${tasks}, false, false, ${row.context_window}, ${row.images})
        RETURNING id`
      return { modelId: model!.id }
    })
  }

  async syncStatus(): Promise<CatalogSyncStatus> {
    const [row] = await this.#db<{ synced_at: Date | null; error: string | null }[]>`
      SELECT synced_at, error FROM catalog_sync WHERE id = 1`
    return { syncedAt: row?.synced_at ? new Date(row.synced_at) : null, error: row?.error ?? null }
  }

  /**
   * Downloads models.dev (skipped on a 304 unless `force`) and applies it. Errors are recorded in the status and
   * rethrown.
   */
  sync(opts: { force?: boolean } = {}): Promise<CatalogSyncResult> {
    return withLock("catalog-sync", async () => {
      try {
        const [state] = await this.#db<{ etag: string | null }[]>`SELECT etag FROM catalog_sync WHERE id = 1`
        const etag = opts.force ? null : (state?.etag ?? null)
        const res = await this.#fetch(this.#url, {
          headers: etag ? { "If-None-Match": etag } : {},
          signal: AbortSignal.timeout(60_000)
        })
        if (res.status === 304) {
          await this.#recordSuccess(etag)
          return { changed: false, providers: { added: 0, updated: 0 }, models: { added: 0, updated: 0, removed: 0 } }
        }
        if (!res.ok) throw new Error(`models.dev answered ${res.status} ${res.statusText}`)
        const result = await this.applyModelsDev(await res.json())
        await this.#recordSuccess(res.headers.get("etag"))
        return result
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        reportError("Catalog sync failed", error)
        await this.#db`
          INSERT INTO catalog_sync (id, error) VALUES (1, ${message})
          ON CONFLICT (id) DO UPDATE SET error = EXCLUDED.error`
        throw error
      }
    })
  }

  /**
   * Applies a models.dev payload: upserts its providers and models, leaving the admin's fields (listed, order, kind,
   * address override, note, edited tasks, defaults) and admin-added rows alone, and marks synced models it no longer
   * lists removed. No network, so the sync and tests share it.
   */
  async applyModelsDev(payload: unknown): Promise<CatalogSyncResult> {
    const entries = z.record(z.string(), z.unknown()).parse(payload)
    const result: CatalogSyncResult = {
      changed: true,
      providers: { added: 0, updated: 0 },
      models: { added: 0, updated: 0, removed: 0 }
    }
    // An empty or broken payload must not mark every synced model removed.
    if (Object.keys(entries).length === 0) throw new Error("models.dev listed no providers")
    const seenProviders: string[] = []

    await this.#db.begin(async tx => {
      for (const raw of Object.values(entries)) {
        const parsed = modelsDevProviderSchema.safeParse(raw)
        if (!parsed.success) continue
        const provider = parsed.data
        const apiUrl = provider.api?.replace(/\/+$/, "") ?? null
        seenProviders.push(provider.id)

        const [row] = await tx<{ id: string; inserted: boolean; source: string }[]>`
          INSERT INTO catalog_provider (slug, name, api_url, doc, npm, source, synced_at)
          VALUES (${provider.id}, ${provider.name}, ${apiUrl}, ${provider.doc ?? null}, ${provider.npm ?? null},
                  'modelsdev', NOW())
          ON CONFLICT (slug) DO UPDATE SET
            name = CASE WHEN catalog_provider.source = 'modelsdev' THEN EXCLUDED.name ELSE catalog_provider.name END,
            api_url = EXCLUDED.api_url, doc = EXCLUDED.doc, npm = EXCLUDED.npm, synced_at = NOW()
          RETURNING id, (xmax = 0) AS inserted, source`
        if (row!.source !== "modelsdev") continue
        if (row!.inserted) result.providers.added++
        else result.providers.updated++

        const models = Object.values(provider.models).flatMap(model => toSyncedModel(model) ?? [])
        await this.#applyModels(tx, row!.id, models, result)
      }

      // A provider models.dev dropped keeps its row, but its synced models are gone.
      const dropped = await tx`
        UPDATE catalog_model SET status = 'removed', updated_at = NOW()
        WHERE source = 'modelsdev' AND status IS DISTINCT FROM 'removed'
          AND provider_id IN (SELECT id FROM catalog_provider
                              WHERE source = 'modelsdev' AND slug <> ALL(${seenProviders}::text[]))`
      result.models.removed += dropped.affectedRows
    })

    this.#invalidate()
    return result
  }

  async #applyModels(tx: SQL, providerId: string, models: SyncedModel[], result: CatalogSyncResult): Promise<void> {
    const existing = await tx<ModelRow[]>`SELECT * FROM catalog_model WHERE provider_id = ${providerId}`
    const before = new Map(existing.map(row => [row.model, row]))
    const seen = new Set<string>()

    for (const model of models) {
      if (seen.has(model.model)) continue
      seen.add(model.model)
      const previous = before.get(model.model)
      if (previous?.source === "admin") continue
      if (!previous) {
        await tx`
          INSERT INTO catalog_model (provider_id, model, name, tasks, context_window, images, status, source, synced_at)
          VALUES (${providerId}, ${model.model}, ${model.name}, ${model.tasks}, ${model.contextWindow}, ${model.images},
                  ${model.status}, 'modelsdev', NOW())`
        result.models.added++
        continue
      }
      const tasks = previous.tasks_edited ? previous.tasks : model.tasks
      const unchanged =
        previous.name === model.name &&
        sameTasks(previous.tasks, tasks) &&
        previous.context_window === model.contextWindow &&
        previous.images === model.images &&
        previous.status === model.status
      if (unchanged) continue
      await tx`
        UPDATE catalog_model
        SET name = ${model.name}, tasks = ${tasks}, context_window = ${model.contextWindow}, images = ${model.images},
            status = ${model.status}, synced_at = NOW(), updated_at = NOW()
        WHERE id = ${previous.id}`
      result.models.updated++
    }

    const gone = existing
      .filter(row => row.source === "modelsdev" && row.status !== "removed" && !seen.has(row.model))
      .map(row => row.id)
    if (gone.length > 0) {
      await tx`UPDATE catalog_model SET status = 'removed', updated_at = NOW() WHERE id = ANY(${gone}::uuid[])`
      result.models.removed += gone.length
    }
  }

  async #recordSuccess(etag: string | null): Promise<void> {
    await this.#db`
      INSERT INTO catalog_sync (id, etag, synced_at, error) VALUES (1, ${etag}, NOW(), NULL)
      ON CONFLICT (id) DO UPDATE SET etag = EXCLUDED.etag, synced_at = EXCLUDED.synced_at, error = NULL`
  }

  #invalidate(): void {
    this.#public = undefined
  }

  #rowToProvider(row: ProviderRow): CatalogProvider {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      kind: row.kind,
      apiUrl: row.api_url,
      baseUrl: row.base_url,
      doc: row.doc,
      npm: row.npm,
      note: row.note,
      position: row.position,
      listed: row.listed,
      source: row.source,
      modelCount: row.model_count ?? 0,
      defaultTasks: row.default_tasks ?? [],
      syncedAt: row.synced_at ? new Date(row.synced_at) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }

  #rowToModel(row: ModelRow): CatalogModel {
    return {
      id: row.id,
      providerId: row.provider_id,
      model: row.model,
      name: row.name,
      tasks: row.tasks,
      tasksEdited: row.tasks_edited,
      defaultTasks: row.default_tasks,
      contextWindow: row.context_window,
      images: row.images,
      status: row.status,
      source: row.source,
      syncedAt: row.synced_at ? new Date(row.synced_at) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }
}
