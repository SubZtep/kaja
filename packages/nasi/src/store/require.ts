import type { ToolContext } from "../agent/tools"
import type { NasiStore } from "./types"

export function requireStore(ctx?: ToolContext): NasiStore {
  if (!ctx?.store) throw new Error("nasi store is not open")
  return ctx.store
}
