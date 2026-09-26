// Empties the TUI's temp folder: generated images and local MCP screenshots, which sessions keep their own copies of.
import { readdir, rm } from "node:fs/promises"
import { getPaths } from "../lib/paths"

const dir = getPaths().temp
const entries = await readdir(dir).catch(() => [])
await rm(dir, { recursive: true, force: true })
console.log(`Removed ${dir} (${entries.length} ${entries.length === 1 ? "entry" : "entries"})`)
