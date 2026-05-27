import type { Pool } from "pg"
import { logger } from "#/core/logger"

/** A Kaja CLI node. */
export interface Node {
  id: string
  userId: string
  name: string
  lastSeen: Date
  status: "idle" | "busy" | "inactive"
}

export class NodeService {
  readonly #db: Pool

  constructor(db: Pool) {
    this.#db = db
  }

  /** Create or update an active node. */
  async connectNode(node: Omit<Node, "lastSeen" | "status">): Promise<Node> {
    const result = await this.#db.query(
      `
      INSERT INTO node (id, user_id, name, last_seen, status)
      VALUES ($1, $2, $3, NOW(), 'idle')
      ON CONFLICT (id)
      DO UPDATE SET
        user_id = EXCLUDED.user_id,
        name = EXCLUDED.name,
        last_seen = NOW(),
        status = 'idle'
      RETURNING *
      `,
      [node.id, node.userId, node.name]
    )

    logger.info({ node: result.rows[0] }, "node connected")
    return this.#rowToNode(result.rows[0])
  }

  async disconnectNode(nodeId: string, userId: string) {
    const { rowCount } = await this.#db.query(
      `
      UPDATE node
      SET status = 'inactive',
          updated_at = NOW()
      WHERE id = $1
        AND user_id = $2
      `,
      [nodeId, userId]
    )

    return rowCount !== null && rowCount > 0
  }

  async heartbeat(nodeId: string, userId: string, status: Exclude<Node["status"], "inactive">): Promise<boolean> {
    const { rowCount } = await this.#db.query(
      `
      UPDATE node
      SET last_seen = NOW(),
          status = $2
      WHERE id = $1
        AND user_id = $3
      `,
      [nodeId, status, userId]
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

  async getNode(nodeId: string, userId: string): Promise<Node | null> {
    const { rows } = await this.#db.query(
      `
      SELECT * FROM node WHERE id = $1 AND user_id = $2
      `,
      [nodeId, userId]
    )

    return rows[0] ? this.#rowToNode(rows[0]) : null
  }

  async getActiveNodes(userId: string): Promise<Node[]> {
    const { rows } = await this.#db.query(
      `
      SELECT * FROM node WHERE user_id = $1 AND status != 'inactive' ORDER BY last_seen DESC
      `,
      [userId]
    )

    return rows.map(row => this.#rowToNode(row))
  }

  async getAllActiveNodes(): Promise<Node[]> {
    const { rows } = await this.#db.query(
      `
      SELECT * FROM node WHERE status != 'inactive' ORDER BY last_seen DESC
      `
    )

    return rows.map(row => this.#rowToNode(row))
  }

  async updateGeoLocation(nodeId: string, geoLocation: unknown): Promise<boolean> {
    logger.info({ nodeId, geoLocation }, "Updating node geo_location")

    const { rowCount } = await this.#db.query(
      `
      UPDATE node
      SET geo_location = $2,
          updated_at = NOW()
      WHERE id = $1
      `,
      [nodeId, geoLocation]
    )

    logger.info({ nodeId, rowCount, updated: rowCount !== null && rowCount > 0 }, "Geo location update result")

    return rowCount !== null && rowCount > 0
  }

  #rowToNode(row: any): Node {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      lastSeen: new Date(row.last_seen),
      status: row.status
    }
  }
}
