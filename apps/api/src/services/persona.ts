import type { CreatePersonaRequest, Persona, UpdatePersonaRequest } from "@kaja/schema/api"
import type { Pool } from "pg"

export class PersonaService {
  readonly #db: Pool

  constructor(db: Pool) {
    this.#db = db
  }

  async createPersona(input: CreatePersonaRequest): Promise<Persona> {
    const result = await this.#db.query(
      `
      INSERT INTO persona (persona_id, label, instructions, when_clause, enabled)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [input.personaId, input.label, input.instructions ?? null, input.when ?? null, input.enabled]
    )

    return this.#rowToPersona(result.rows[0])
  }

  async updatePersona(id: string, input: UpdatePersonaRequest): Promise<Persona | null> {
    const result = await this.#db.query(
      `
      UPDATE persona
      SET persona_id = COALESCE($2, persona_id),
          label = COALESCE($3, label),
          instructions = COALESCE($4, instructions),
          when_clause = COALESCE($5, when_clause),
          enabled = COALESCE($6, enabled),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [
        id,
        input.personaId ?? null,
        input.label ?? null,
        input.instructions ?? null,
        input.when ?? null,
        input.enabled ?? null
      ]
    )

    return result.rows[0] ? this.#rowToPersona(result.rows[0]) : null
  }

  async deletePersona(id: string): Promise<boolean> {
    const result = await this.#db.query(`DELETE FROM persona WHERE id = $1`, [id])
    return result.rowCount !== null && result.rowCount > 0
  }

  async listPersonas(): Promise<Persona[]> {
    const { rows } = await this.#db.query(`SELECT * FROM persona ORDER BY created_at`)
    return rows.map(row => this.#rowToPersona(row))
  }

  /** Enabled personas, for the hosted agent loop's persona catalog. */
  async listEnabled(): Promise<Persona[]> {
    const { rows } = await this.#db.query(`SELECT * FROM persona WHERE enabled ORDER BY created_at`)
    return rows.map(row => this.#rowToPersona(row))
  }

  #rowToPersona(row: any): Persona {
    return {
      id: row.id,
      personaId: row.persona_id,
      label: row.label,
      instructions: row.instructions,
      when: row.when_clause,
      enabled: row.enabled,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }
}
