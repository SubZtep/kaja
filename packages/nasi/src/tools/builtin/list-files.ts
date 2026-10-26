import { z } from "zod"
import { type Tool, tool, ToolError } from "../../agent/agent"
import { guardWorkspacePath, hiddenPathApproval, PathDeniedError, PathEscapeError } from "../path-guard"

/**
 * Lists files under a directory, optionally by glob pattern.
 *
 * @param args.path - Directory to list.
 * @param args.pattern - Glob pattern relative to path (default "*", immediate children only; use e.g. "**\/*" to recurse).
 * @returns Matching paths, one per line, relative to path.
 */
export const listFilesTool: Tool<{ path: string; pattern?: string }> = {
  ...tool({
    name: "list_files",
    description:
      "List files under a directory. Optionally filter with a glob pattern (default lists immediate children only; use a recursive pattern like '**/*.ts' to search subdirectories).",
    schema: z.object({
      path: z.string().describe("Directory to list"),
      pattern: z
        .string()
        .optional()
        .describe("Glob pattern relative to path, e.g. '*.ts' or '**/*.ts'. Defaults to '*' (immediate children only).")
    }),
    execute: async args => {
      let safePath: string
      try {
        safePath = guardWorkspacePath(args.path)
      } catch (error) {
        if (error instanceof PathEscapeError || error instanceof PathDeniedError) {
          throw new ToolError("list_files", error.message)
        }
        throw error
      }
      const glob = new Bun.Glob(args.pattern ?? "*")
      const matches: string[] = []
      for await (const match of glob.scan({ cwd: safePath, dot: false })) {
        matches.push(match)
      }
      matches.sort((a, b) => a.localeCompare(b))
      return matches.length > 0 ? matches.join("\n") : "(no matches)"
    }
  }),
  // The model's arguments, not yet checked: a dot-folder in the workspace asks first
  approval: args => hiddenPathApproval("List", args?.path)
}
