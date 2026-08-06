import type { CreateMcpServerRequest, McpServer, UpdateMcpServerRequest } from "@kaja/schema/api"
import type { Pool } from "pg"

export class McpServerService {
  readonly #db: Pool

  constructor(db: Pool) {
    this.#db = db
  }

  async create(input: CreateMcpServerRequest): Promise<McpServer> {
    const result = await this.#db.query(
      `
      INSERT INTO mcp_server (server_id, command, args, env, url, headers, enabled)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [
        input.serverId,
        input.command ?? null,
        JSON.stringify(input.args),
        JSON.stringify(input.env),
        input.url ?? null,
        JSON.stringify(input.headers),
        input.enabled
      ]
    )

    return this.#rowToMcpServer(result.rows[0])
  }

  async update(id: string, input: UpdateMcpServerRequest): Promise<McpServer | null> {
    const result = await this.#db.query(
      `
      UPDATE mcp_server
      SET server_id = COALESCE($2, server_id),
          command = COALESCE($3, command),
          args = COALESCE($4, args),
          env = COALESCE($5, env),
          url = COALESCE($6, url),
          headers = COALESCE($7, headers),
          enabled = COALESCE($8, enabled),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [
        id,
        input.serverId ?? null,
        input.command !== undefined ? input.command : null,
        input.args !== undefined ? JSON.stringify(input.args) : null,
        input.env !== undefined ? JSON.stringify(input.env) : null,
        input.url !== undefined ? input.url : null,
        input.headers !== undefined ? JSON.stringify(input.headers) : null,
        input.enabled ?? null
      ]
    )

    return result.rows[0] ? this.#rowToMcpServer(result.rows[0]) : null
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.#db.query(`DELETE FROM mcp_server WHERE id = $1`, [id])
    return result.rowCount !== null && result.rowCount > 0
  }

  async list(): Promise<McpServer[]> {
    const { rows } = await this.#db.query(`SELECT * FROM mcp_server ORDER BY created_at`)
    return rows.map(row => this.#rowToMcpServer(row))
  }

  async listEnabled(): Promise<McpServer[]> {
    const { rows } = await this.#db.query(`SELECT * FROM mcp_server WHERE enabled ORDER BY created_at`)
    return rows.map(row => this.#rowToMcpServer(row))
  }

  async getById(id: string): Promise<McpServer | null> {
    const { rows } = await this.#db.query(`SELECT * FROM mcp_server WHERE id = $1`, [id])
    return rows[0] ? this.#rowToMcpServer(rows[0]) : null
  }

  #rowToMcpServer(row: any): McpServer {
    return {
      id: row.id,
      serverId: row.server_id,
      command: row.command ?? null,
      args: row.args ?? [],
      env: row.env ?? {},
      url: row.url ?? null,
      headers: row.headers ?? {},
      enabled: row.enabled,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }
  }
}
