/** A Kaja CLI node. */
export interface Node {
  id: string
  userId: string
  name: string
  lastSeen: Date
  status: "idle" | "busy" | "inactive"
}
