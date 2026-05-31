import type { GeoLocation } from "@kaja/geo"
import { and, desc, eq, lt, ne } from "drizzle-orm"
import type { Database } from "../../../core/db"
import { logger } from "../../../core/logger"
import { type Node as DbNode, node as nodeTable } from "../../../db/schema"
import { emitNodeEvent } from "./events"

/** A Kaja CLI node. */
export interface Node {
  id: string
  userId: string
  name: string
  lastSeen: Date
  status: "idle" | "busy" | "inactive"
}

export class NodeService {
  readonly #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  /** Create or update an active node. */
  async connectNode(node: Omit<Node, "lastSeen" | "status">): Promise<Node> {
    const [result] = await this.#db
      .insert(nodeTable)
      .values({
        id: node.id as any,
        userId: node.userId as any,
        name: node.name,
        lastSeen: new Date(),
        status: "idle"
      })
      .onConflictDoUpdate({
        target: nodeTable.id,
        set: {
          userId: node.userId as any,
          name: node.name,
          lastSeen: new Date(),
          status: "idle"
        }
      })
      .returning()

    logger.info({ node: result }, "node connected")
    const connectedNode = this.#rowToNode(result)

    emitNodeEvent({
      type: "connected",
      node: connectedNode,
      userId: connectedNode.userId
    })

    return connectedNode
  }

  async disconnectNode(nodeId: string, userId: string) {
    const result = await this.#db
      .update(nodeTable)
      .set({
        status: "inactive",
        updatedAt: new Date()
      })
      .where(and(eq(nodeTable.id, nodeId as any), eq(nodeTable.userId, userId as any)))
      .returning()

    if (result[0]) {
      const disconnectedNode = this.#rowToNode(result[0])
      emitNodeEvent({
        type: "disconnected",
        node: disconnectedNode,
        userId
      })
    }

    return result.length > 0
  }

  async heartbeat(nodeId: string, userId: string, status: Exclude<Node["status"], "inactive">): Promise<boolean> {
    // First, get the current node state to check if status is changing
    const currentNode = await this.getNode(nodeId, userId)

    if (!currentNode) {
      return false
    }

    // Update the node
    const result = await this.#db
      .update(nodeTable)
      .set({
        lastSeen: new Date(),
        status
      })
      .where(and(eq(nodeTable.id, nodeId as any), eq(nodeTable.userId, userId as any)))
      .returning()

    if (result[0]) {
      const updatedNode = this.#rowToNode(result[0])

      // Only emit event if status actually changed
      // This prevents unnecessary SSE traffic for heartbeats that only update lastSeen
      if (currentNode.status !== status) {
        emitNodeEvent({
          type: "heartbeat",
          node: updatedNode,
          userId
        })
      }
    }

    return result.length > 0
  }

  async markInactiveNodes(timeoutSeconds = 300): Promise<number> {
    const cutoffTime = new Date(Date.now() - timeoutSeconds * 1000)

    const result = await this.#db
      .update(nodeTable)
      .set({
        status: "inactive",
        updatedAt: new Date()
      })
      .where(and(ne(nodeTable.status, "inactive"), lt(nodeTable.lastSeen, cutoffTime)))
      .returning()

    if (result.length > 0) {
      logger.info({ count: result.length }, "marked nodes as inactive")

      // Emit event for each node that became inactive
      for (const row of result) {
        const inactiveNode = this.#rowToNode(row)
        emitNodeEvent({
          type: "inactive",
          node: inactiveNode,
          userId: inactiveNode.userId
        })
      }
    }

    return result.length
  }

  async getNode(nodeId: string, userId: string): Promise<Node | null> {
    const result = await this.#db
      .select()
      .from(nodeTable)
      .where(and(eq(nodeTable.id, nodeId as any), eq(nodeTable.userId, userId as any)))
      .limit(1)

    return result[0] ? this.#rowToNode(result[0]) : null
  }

  async getActiveNodes(userId: string): Promise<Node[]> {
    const result = await this.#db
      .select()
      .from(nodeTable)
      .where(and(eq(nodeTable.userId, userId as any), ne(nodeTable.status, "inactive")))
      .orderBy(desc(nodeTable.lastSeen))

    return result.map(row => this.#rowToNode(row))
  }

  async getAllActiveNodes(): Promise<Node[]> {
    const result = await this.#db
      .select()
      .from(nodeTable)
      .where(ne(nodeTable.status, "inactive"))
      .orderBy(desc(nodeTable.lastSeen))

    return result.map(row => this.#rowToNode(row))
  }

  async updateGeoLocation(nodeId: string, geoLocation: GeoLocation): Promise<boolean> {
    logger.info({ nodeId, geoLocation }, "Updating node geo_location")

    const result = await this.#db
      .update(nodeTable)
      .set({
        geoLocation: geoLocation as any,
        updatedAt: new Date()
      })
      .where(eq(nodeTable.id, nodeId as any))
      .returning()

    const updated = result.length > 0

    logger.info({ nodeId, rowCount: result.length, updated }, "Geo location update result")

    return updated
  }

  #rowToNode(row: DbNode): Node {
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      lastSeen: new Date(row.lastSeen),
      status: row.status
    }
  }
}
