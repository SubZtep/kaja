import { EventEmitter } from "node:events"
import type { Node } from "./node"

export interface NodeEvent {
  type: "connected" | "heartbeat" | "disconnected" | "inactive"
  node: Node
  userId: string
}

/**
 * Global event emitter for node status changes.
 * Used to broadcast real-time updates to SSE clients.
 */
export const nodeEvents = new EventEmitter()

export function emitNodeEvent(event: NodeEvent) {
  nodeEvents.emit("node-update", event)
}
