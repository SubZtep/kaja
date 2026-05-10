import type { Pool } from "pg"
import { logger } from "#/core/logger"

export interface Node {
  id: string
  name: string
  lastSeen: Date
  status: "idle" | "busy" | "inactive"
}

export class NodeService {
  readonly #db: Pool

  constructor(db: Pool) {
    this.#db = db
  }

  async registerNode(node: Omit<Node, "lastSeen" | "status">): Promise<Node> {
    const result = await this.#db.query(
      `
      INSERT INTO node (id, name, last_seen, status)
      VALUES ($1, $2, NOW(), 'idle')
      ON CONFLICT (id)
      DO UPDATE SET
        name = EXCLUDED.name,
        last_seen = NOW(),
        status = 'idle'
      RETURNING *
      `,
      [node.id, node.name]
    )

    logger.info({ node: result.rows[0] }, "registered node")
    return this.#rowToNode(result.rows[0])
  }

  async heartbeat(nodeId: string, status: "idle" | "busy"): Promise<boolean> {
    const { rowCount } = await this.#db.query(
      `
      UPDATE node
      SET last_seen = NOW(),
          status = $2
      WHERE id = $1
      `,
      [nodeId, status]
    )

    return rowCount !== null && rowCount > 0
  }

  async markInactiveNodes(timeoutSeconds = 300): Promise<number> {
    const { rowCount } = await this.#db.query(
      `
      UPDATE node
      SET status = 'inactive',
          updated_at = NOW()
      WHERE status != 'inactive'
        AND last_seen < NOW() - INTERVAL '${timeoutSeconds} seconds'
      `
    )

    if (rowCount && rowCount > 0) {
      logger.info({ count: rowCount }, "marked nodes as inactive")
    }

    return rowCount || 0
  }

  async getNode(nodeId: string): Promise<Node | null> {
    const { rows } = await this.#db.query(
      `
      SELECT * FROM node WHERE id = $1
      `,
      [nodeId]
    )

    return rows[0] ? this.#rowToNode(rows[0]) : null
  }

  async getActiveNodes(): Promise<Node[]> {
    const { rows } = await this.#db.query(
      `
      SELECT * FROM node WHERE status != 'inactive' ORDER BY last_seen DESC
      `
    )

    return rows.map(row => this.#rowToNode(row))
  }

  #rowToNode(row: any): Node {
    return {
      id: row.id,
      name: row.name,
      lastSeen: new Date(row.last_seen),
      status: row.status
    }
  }
}
