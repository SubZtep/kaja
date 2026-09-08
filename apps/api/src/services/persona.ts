import type { CreatePersonaRequest, Persona, UpdatePersonaRequest } from "@kaja/schema/api"
import type { Pool } from "pg"

export class PersonaService {
  readonly #db: Pool

  constructor(db: Pool) {
    this.#db = db
  }

  async create(input: CreatePersonaRequest): Promise<Persona> {
    const result = await this.#db.query(
      `
      INSERT INTO persona (persona_id, label, "when", instructions, dataset, models, sampling, enabled, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
      `,
      [
        input.personaId,
        input.label,
        input.when ?? null,
        input.instructions ?? null,
        input.dataset ?? null,
        JSON.stringify(input.models ?? {}),
        JSON.stringify(input.sampling ?? {}),
        input.enabled,
        input.sortOrder
      ]
    )

    return this.#rowToPersona(result.rows[0])
  }

  async update(id: string, input: UpdatePersonaRequest): Promise<Persona | null> {
    const result = await this.#db.query(
      `
      UPDATE persona
      SET persona_id = COALESCE($2, persona_id),
          label = COALESCE($3, label),
          "when" = COALESCE($4, "when"),
          instructions = COALESCE($5, instructions),
          dataset = COALESCE($6, dataset),
          models = COALESCE($7, models),
          sampling = COALESCE($8, sampling),
          enabled = COALESCE($9, enabled),
          sort_order = COALESCE($10, sort_order),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [
        id,
        input.personaId ?? null,
        input.label ?? null,
        input.when ?? null,
        input.instructions ?? null,
        input.dataset ?? null,
        input.models !== undefined ? JSON.stringify(input.models) : null,
        input.sampling !== undefined ? JSON.stringify(input.sampling) : null,
        input.enabled ?? null,
        input.sortOrder ?? null
      ]
    )

    return result.rows[0] ? this.#rowToPersona(result.rows[0]) : null
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.#db.query(`DELETE FROM persona WHERE id = $1`, [id])
    return result.rowCount !== null && result.rowCount > 0
  }

  async list(): Promise<Persona[]> {
    const { rows } = await this.#db.query(`SELECT * FROM persona ORDER BY sort_order, created_at`)
    return rows.map(row => this.#rowToPersona(row))
  }

  async listEnabled(): Promise<Persona[]> {
    const { rows } = await this.#db.query(`SELECT * FROM persona WHERE enabled ORDER BY sort_order, created_at`)
    return rows.map(row => this.#rowToPersona(row))
  }

  async getByPersonaId(personaId: string): Promise<Persona | null> {
    const { rows } = await this.#db.query(`SELECT * FROM persona WHERE persona_id = $1`, [personaId])
    return rows[0] ? this.#rowToPersona(rows[0]) : null
  }

  #rowToPersona(row: any): Persona {
    return {
      id: row.id,
      personaId: row.persona_id,
      label: row.label,
      when: row.when,
      instructions: row.instructions,
      dataset: row.dataset,
      models: row.models,
      sampling: row.sampling,
      enabled: row.enabled,
      sortOrder: row.sort_order,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }
}
