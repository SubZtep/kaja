import { EventEmitter } from "node:events"
import type { Command, Node } from "@kaja/schema/api"

export interface NodeEvent {
  type: "connected" | "heartbeat" | "disconnected" | "inactive"
  node: Node
  userId: string
}

export interface CommandEvent {
  type: "created" | "started" | "completed" | "failed" | "timeout"
  command: Command
  nodeId: string
}

/**
 * Global event emitter for node status changes.
 * Used to broadcast real-time updates to SSE clients.
 */
export const nodeEvents = new EventEmitter()

/**
 * Global event emitter for command lifecycle events.
 * Used to push commands to CLI nodes via SSE.
 */
export const commandEvents = new EventEmitter()

export function emitNodeEvent(event: NodeEvent) {
  nodeEvents.emit("node-update", event)
}

export function emitCommandEvent(event: CommandEvent) {
  commandEvents.emit("command-update", event)
}
