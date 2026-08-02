import type {
  CreateModelRequest,
  CreateProviderRequest,
  Model,
  Provider,
  UpdateModelRequest,
  UpdateProviderRequest
} from "@kaja/schema"
import type { Pool } from "pg"

export class ModelService {
  readonly #db: Pool

  constructor(db: Pool) {
    this.#db = db
  }

  async createProvider(input: CreateProviderRequest): Promise<Provider> {
    const result = await this.#db.query(
      `
      INSERT INTO provider (name, base_url, api_key)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [input.name, input.baseUrl, input.apiKey ?? null]
    )

    return this.#rowToProvider(result.rows[0])
  }

  async updateProvider(id: string, input: UpdateProviderRequest): Promise<Provider | null> {
    const result = await this.#db.query(
      `
      UPDATE provider
      SET name = COALESCE($2, name),
          base_url = COALESCE($3, base_url),
          api_key = COALESCE($4, api_key),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [id, input.name ?? null, input.baseUrl ?? null, input.apiKey ?? null]
    )

    return result.rows[0] ? this.#rowToProvider(result.rows[0]) : null
  }

  async deleteProvider(id: string): Promise<boolean> {
    const result = await this.#db.query(`DELETE FROM provider WHERE id = $1`, [id])
    return result.rowCount !== null && result.rowCount > 0
  }

  async listProviders(): Promise<Provider[]> {
    const { rows } = await this.#db.query(`SELECT * FROM provider ORDER BY created_at`)
    return rows.map(row => this.#rowToProvider(row))
  }

  async createModel(input: CreateModelRequest): Promise<Model> {
    const result = await this.#db.query(
      `
      INSERT INTO model (provider_id, model, tasks, enabled)
      VALUES ($1, $2, $3, $4)
      RETURNING *
      `,
      [input.providerId, input.model, input.tasks, input.enabled]
    )

    return this.#rowToModel(result.rows[0])
  }

  async updateModel(id: string, input: UpdateModelRequest): Promise<Model | null> {
    const result = await this.#db.query(
      `
      UPDATE model
      SET provider_id = COALESCE($2, provider_id),
          model = COALESCE($3, model),
          tasks = COALESCE($4, tasks),
          enabled = COALESCE($5, enabled),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [id, input.providerId ?? null, input.model ?? null, input.tasks ?? null, input.enabled ?? null]
    )

    return result.rows[0] ? this.#rowToModel(result.rows[0]) : null
  }

  async deleteModel(id: string): Promise<boolean> {
    const result = await this.#db.query(`DELETE FROM model WHERE id = $1`, [id])
    return result.rowCount !== null && result.rowCount > 0
  }

  async listModels(): Promise<Model[]> {
    const { rows } = await this.#db.query(`SELECT * FROM model ORDER BY created_at`)
    return rows.map(row => this.#rowToModel(row))
  }

  /** A single model with its resolved provider, for handing credentials to a caller. */
  async getModelWithProvider(id: string): Promise<{ model: Model; provider: Provider } | null> {
    const { rows } = await this.#db.query(
      `
      SELECT m.*,
             p.name AS provider_name,
             p.base_url AS provider_base_url,
             p.api_key AS provider_api_key,
             p.created_at AS provider_created_at,
             p.updated_at AS provider_updated_at
      FROM model m
      JOIN provider p ON p.id = m.provider_id
      WHERE m.id = $1
      `,
      [id]
    )

    const row = rows[0]
    if (!row) return null

    return {
      model: this.#rowToModel(row),
      provider: this.#rowToProvider({
        id: row.provider_id,
        name: row.provider_name,
        base_url: row.provider_base_url,
        api_key: row.provider_api_key,
        created_at: row.provider_created_at,
        updated_at: row.provider_updated_at
      })
    }
  }

  /** Enabled models with their provider, for rendering models.toml. */
  async listEnabledWithProviders(): Promise<{ providers: Provider[]; models: Model[] }> {
    const { rows: providerRows } = await this.#db.query(
      `
      SELECT DISTINCT p.* FROM provider p
      JOIN model m ON m.provider_id = p.id
      WHERE m.enabled
      ORDER BY p.created_at
      `
    )
    const { rows: modelRows } = await this.#db.query(`SELECT * FROM model WHERE enabled ORDER BY created_at`)
    return {
      providers: providerRows.map(row => this.#rowToProvider(row)),
      models: modelRows.map(row => this.#rowToModel(row))
    }
  }

  #rowToProvider(row: any): Provider {
    return {
      id: row.id,
      name: row.name,
      baseUrl: row.base_url,
      apiKey: row.api_key,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }

  #rowToModel(row: any): Model {
    return {
      id: row.id,
      providerId: row.provider_id,
      model: row.model,
      tasks: row.tasks,
      enabled: row.enabled,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }
}
