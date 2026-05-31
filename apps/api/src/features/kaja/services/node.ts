import { info } from "@kaja/logger"
import type { GeoLocation, Node } from "@kaja/schema"
import { and, desc, eq, lt, ne } from "drizzle-orm"
import type { Database } from "../../../core/db"
import { type NodeRow, node as nodeTable } from "../../../db/schema"
import { emitNodeEvent } from "./events"

export class NodeService {
  readonly #db: Database

  constructor(db: Database) {
    this.#db = db
  }

  /** Create or update an active node. */
  async connectNode(node: Pick<Node, "id" | "userId" | "name">): Promise<Node> {
    const [result] = await this.#db
      .insert(nodeTable)
      .values({
        id: node.id,
        userId: node.userId,
        name: node.name,
        lastSeen: new Date(),
        status: "idle"
      })
      .onConflictDoUpdate({
        target: nodeTable.id,
        set: {
          userId: node.userId,
          name: node.name,
          lastSeen: new Date(),
          status: "idle"
        }
      })
      .returning()

    info("node connected", { node: result })
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
      .where(and(eq(nodeTable.id, nodeId), eq(nodeTable.userId, userId)))
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
      .where(and(eq(nodeTable.id, nodeId), eq(nodeTable.userId, userId)))
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
      info("marked nodes as inactive", { count: result.length })

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
      .where(and(eq(nodeTable.id, nodeId), eq(nodeTable.userId, userId)))
      .limit(1)

    return result[0] ? this.#rowToNode(result[0]) : null
  }

  async getActiveNodes(userId: string): Promise<Node[]> {
    const result = await this.#db
      .select()
      .from(nodeTable)
      .where(and(eq(nodeTable.userId, userId), ne(nodeTable.status, "inactive")))
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
    info("Updating node geo_location", { nodeId, geoLocation })

    const result = await this.#db
      .update(nodeTable)
      .set({
        geoLocation: geoLocation as any,
        updatedAt: new Date()
      })
      .where(eq(nodeTable.id, nodeId as any))
      .returning()

    const updated = result.length > 0

    info("Geo location update result", { nodeId, rowCount: result.length, updated })

    return updated
  }

  #rowToNode(row: NodeRow): Node {
    return {
      id: row.id,
      userId: row.userId,
      name: row.name,
      lastSeen: row.lastSeen,
      // lastSeen: new Date(row.lastSeen),
      geoLocation: row.geoLocation,
      status: row.status
    }
  }
}
