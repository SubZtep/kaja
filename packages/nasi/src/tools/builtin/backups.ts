import { cp, stat } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { type Tool, ToolError, tool } from "../../agent/agent"
import {
  backupFiles,
  backupFolder,
  listBackups,
  nearestRoot,
  type RootFolder,
  readOnlyRefusal,
  realPath
} from "../../mcp/roots"

/** The backup tools' names, left out for a persona whose folders aren't backed up. */
export const BACKUP_TOOL_NAMES = new Set(["list_backups", "restore_backup"])

// The real path, when it's in one of the persona's backed-up folders (and not a read-only one when writing).
function backedUpPath(name: string, roots: RootFolder[], path: string, writes: boolean): string {
  const real = realPath(path)
  const root = nearestRoot(roots, real)
  if (!root?.backup) throw new ToolError(name, `${path} isn't in a folder this persona backs up.`)
  const refused = writes && readOnlyRefusal(roots, ["path"], { path })
  if (refused) throw new ToolError(name, refused)
  return real
}

/**
 * `list_backups` and `restore_backup` over the copies Kaja makes in `backupDir` before a roots-taking MCP server writes
 * into a backed-up folder (`roots()` gives the active persona's folders). A restore backs the current file up first,
 * so it can be undone too.
 */
export function backupTools(backupDir: string, roots: () => RootFolder[]): Tool[] {
  const listTool = tool({
    name: "list_backups",
    description:
      "List the backups Kaja made of a file before it was changed, newest first. Each version is the time it was taken (UTC).",
    schema: z.object({ path: z.string().describe("Absolute path of the file") }),
    execute: async args => {
      const real = backedUpPath("list_backups", roots(), args.path, false)
      const versions = await listBackups(backupDir, real)
      return versions.length ? versions.join("\n") : `No backups of ${args.path} yet.`
    }
  })
  const restoreTool = tool({
    name: "restore_backup",
    description:
      "Put a file back as it was in one of its backups (the newest unless `version` says which). The current file is backed up first, so this can be undone.",
    schema: z.object({
      path: z.string().describe("Absolute path of the file"),
      version: z.string().optional().describe("A version from list_backups; unset means the newest")
    }),
    execute: async args => {
      const real = backedUpPath("restore_backup", roots(), args.path, true)
      const versions = await listBackups(backupDir, real)
      const version = args.version ?? versions[0]
      if (!version || !versions.includes(version))
        throw new ToolError("restore_backup", `No backup ${args.version ?? ""} of ${args.path}; see list_backups.`)
      const copy = join(backupFolder(backupDir, real), version)
      if ((await stat(copy)).isDirectory())
        throw new ToolError("restore_backup", `That backup is a folder; restore it by hand from ${copy}.`)
      await backupFiles([real], backupDir)
      await cp(copy, real, { force: true, preserveTimestamps: false })
      return `Restored ${args.path} from ${version}.`
    }
  })
  return [
    { ...listTool, readOnly: true },
    { ...restoreTool, approval: args => `restore_backup ${args.path} ${args.version ?? "(newest)"}` }
  ]
}
