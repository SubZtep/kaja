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
    // Built from the keys actually present so an explicit null clears the column, while an absent
    // key leaves it untouched — COALESCE over every column can't tell those two cases apart.
    const columns: Record<string, unknown> = {}
    if (input.personaId !== undefined) columns.persona_id = input.personaId
    if (input.label !== undefined) columns.label = input.label
    if (input.when !== undefined) columns['"when"'] = input.when
    if (input.instructions !== undefined) columns.instructions = input.instructions
    if (input.dataset !== undefined) columns.dataset = input.dataset
    if (input.models !== undefined) columns.models = JSON.stringify(input.models)
    if (input.sampling !== undefined) columns.sampling = JSON.stringify(input.sampling)
    if (input.enabled !== undefined) columns.enabled = input.enabled
    if (input.sortOrder !== undefined) columns.sort_order = input.sortOrder

    const entries = Object.entries(columns)
    if (entries.length === 0) return this.get(id)

    const assignments = entries.map(([column], index) => `${column} = $${index + 2}`).join(", ")
    const result = await this.#db.query(
      `UPDATE persona SET ${assignments}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...entries.map(([, value]) => value)]
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

  async get(id: string): Promise<Persona | null> {
    const { rows } = await this.#db.query(`SELECT * FROM persona WHERE id = $1`, [id])
    return rows[0] ? this.#rowToPersona(rows[0]) : null
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
