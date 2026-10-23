import type {
  CreateModelRequest,
  CreateProviderRequest,
  Model,
  ModelTask,
  Provider,
  UpdateModelRequest,
  UpdateProviderRequest
} from "@kaja/schema/api"
import type { SQL } from "bun"

/**
 * `Provider` with the real api_key value — never returned from the admin API, only used to authenticate an actual
 * outbound call to the provider.
 */
type ProviderWithSecret = Omit<Provider, "hasApiKey"> & { apiKey: string | null }

// Rows as Bun.SQL returns them (timestamptz as Date); `last_used_at` only where a query joins usage in.
type ProviderRow = {
  id: string
  name: string
  base_url: string
  api_key: string | null
  created_at: Date
  updated_at: Date
}

type ModelRow = {
  id: string
  provider_id: string
  model: string
  tasks: Model["tasks"]
  enabled: boolean
  free: boolean
  context_window: number | null
  images: boolean
  created_at: Date
  updated_at: Date
  last_used_at?: Date | null
}

type ModelWithProviderRow = ModelRow & {
  provider_name: string
  provider_base_url: string
  provider_api_key: string | null
  provider_created_at: Date
  provider_updated_at: Date
}

export class ModelService {
  readonly #db: SQL

  constructor(db: SQL) {
    this.#db = db
  }

  async createProvider(input: CreateProviderRequest): Promise<Provider> {
    const [row] = await this.#db<ProviderRow[]>`
      INSERT INTO provider (name, base_url, api_key)
      VALUES (${input.name}, ${input.baseUrl}, ${input.apiKey ?? null})
      RETURNING *`
    return this.#rowToProvider(row!)
  }

  async updateProvider(id: string, input: UpdateProviderRequest): Promise<Provider | null> {
    const [row] = await this.#db<ProviderRow[]>`
      UPDATE provider
      SET name = COALESCE(${input.name ?? null}, name),
          base_url = COALESCE(${input.baseUrl ?? null}, base_url),
          api_key = COALESCE(${input.apiKey ?? null}, api_key),
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING *`
    return row ? this.#rowToProvider(row) : null
  }

  async deleteProvider(id: string): Promise<boolean> {
    const result = await this.#db`DELETE FROM provider WHERE id = ${id}`
    return result.affectedRows > 0
  }

  async listProviders(): Promise<Provider[]> {
    const rows = await this.#db<ProviderRow[]>`SELECT * FROM provider ORDER BY created_at`
    return rows.map(row => this.#rowToProvider(row))
  }

  async createModel(input: CreateModelRequest): Promise<Model> {
    const [row] = await this.#db<ModelRow[]>`
      INSERT INTO model (provider_id, model, tasks, enabled, free, context_window, images)
      VALUES (${input.providerId}, ${input.model}, ${input.tasks}, ${input.enabled}, ${input.free},
              ${input.contextWindow}, ${input.images})
      RETURNING *`
    return this.#rowToModel(row!)
  }

  async updateModel(id: string, input: UpdateModelRequest): Promise<Model | null> {
    const [row] = await this.#db<ModelRow[]>`
      UPDATE model
      SET provider_id = COALESCE(${input.providerId ?? null}, provider_id),
          model = COALESCE(${input.model ?? null}, model),
          tasks = COALESCE(${input.tasks ?? null}, tasks),
          enabled = COALESCE(${input.enabled ?? null}, enabled),
          free = COALESCE(${input.free ?? null}, free),
          context_window = CASE WHEN ${input.contextWindow !== undefined} THEN ${input.contextWindow ?? null}::int
                                ELSE context_window END,
          images = COALESCE(${input.images ?? null}, images),
          updated_at = NOW()
      WHERE id = ${id}
      RETURNING *`
    return row ? this.#rowToModel(row) : null
  }

  async deleteModel(id: string): Promise<boolean> {
    const result = await this.#db`DELETE FROM model WHERE id = ${id}`
    return result.affectedRows > 0
  }

  // TODO: rethink this — nasi_session.model is free text matched by name, not a foreign key to model.id,
  // so a renamed/re-added model silently loses its usage history.
  async listModels(): Promise<Model[]> {
    const rows = await this.#db<ModelRow[]>`
      SELECT m.*, s.last_used_at
      FROM model m
      LEFT JOIN (
        SELECT model, MAX(updated_at) AS last_used_at
        FROM nasi_session
        GROUP BY model
      ) s ON s.model = m.model
      ORDER BY m.created_at`
    return rows.map(row => this.#rowToModel(row))
  }

  /** A single model with its resolved provider, for handing credentials to a caller. */
  async getModelWithProvider(id: string): Promise<{ model: Model; provider: ProviderWithSecret } | null> {
    return this.#withProvider(this.#db`m.id = ${id}`)
  }

  /**
   * A specific free+enabled chat model by name, with its resolved provider — used to re-resolve a session's previously
   * pinned model.
   */
  async getModelWithProviderByName(model: string): Promise<{ model: Model; provider: ProviderWithSecret } | null> {
    return this.#withProvider(
      this.#db`m.model = ${model} AND m.enabled AND m.free AND m.tasks @> ARRAY['chat']::text[]`
    )
  }

  /** A random free+enabled model for `task` (chat unless given) with its resolved provider. */
  async getRandomModelWithProvider(
    task: ModelTask = "chat"
  ): Promise<{ model: Model; provider: ProviderWithSecret } | null> {
    return this.#withProvider(
      this.#db`m.enabled AND m.free AND m.tasks @> ARRAY[${task}]::text[]`,
      this.#db`ORDER BY random()`
    )
  }

  /** Enabled models with their provider, for rendering models.toml. */
  async listEnabledWithProviders(): Promise<{ providers: Provider[]; models: Model[] }> {
    const providerRows = await this.#db<ProviderRow[]>`
      SELECT DISTINCT p.* FROM provider p
      JOIN model m ON m.provider_id = p.id
      WHERE m.enabled
      ORDER BY p.created_at`
    const modelRows = await this.#db<ModelRow[]>`SELECT * FROM model WHERE enabled ORDER BY created_at`
    return {
      providers: providerRows.map(row => this.#rowToProvider(row)),
      models: modelRows.map(row => this.#rowToModel(row))
    }
  }

  // The first model matching `where` (in `order`), joined to its provider
  async #withProvider(
    where: SQL.Query<unknown>,
    order: SQL.Query<unknown> = this.#db``
  ): Promise<{ model: Model; provider: ProviderWithSecret } | null> {
    const [row] = await this.#db<ModelWithProviderRow[]>`
      SELECT m.*,
             p.name AS provider_name,
             p.base_url AS provider_base_url,
             p.api_key AS provider_api_key,
             p.created_at AS provider_created_at,
             p.updated_at AS provider_updated_at
      FROM model m
      JOIN provider p ON p.id = m.provider_id
      WHERE ${where}
      ${order}
      LIMIT 1`
    if (!row) return null
    return {
      model: this.#rowToModel(row),
      provider: this.#rowToProviderWithSecret({
        id: row.provider_id,
        name: row.provider_name,
        base_url: row.provider_base_url,
        api_key: row.provider_api_key,
        created_at: row.provider_created_at,
        updated_at: row.provider_updated_at
      })
    }
  }

  #rowToProvider(row: ProviderRow): Provider {
    return {
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      hasApiKey: row.api_key != null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }

  #rowToProviderWithSecret(row: ProviderRow): ProviderWithSecret {
    return {
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      apiKey: row.api_key,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }

  #rowToModel(row: ModelRow): Model {
    return {
      id: row.id,
      providerId: row.provider_id,
      model: row.model,
      tasks: row.tasks,
      enabled: row.enabled,
      free: row.free,
      contextWindow: row.context_window,
      images: row.images,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : null
    }
  }
}
