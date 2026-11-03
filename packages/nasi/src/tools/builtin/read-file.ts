import { z } from "zod"
import { type Tool, tool, ToolError } from "../../agent/agent"
import { guardWorkspacePath, hiddenPathApproval, PathDeniedError, PathEscapeError } from "../path-guard"

/**
 * Reads a text file from disk.
 *
 * @param args.path - Path to the file to read.
 * @returns The file's contents as a string.
 */
export const readFileTool: Tool<{ path: string }> = {
  ...tool({
    name: "read_file",
    description: "Read a text file",
    schema: z.object({
      path: z.string().describe("Path to the file")
    }),
    execute: args => {
      let safePath: string
      try {
        safePath = guardWorkspacePath(args.path)
      } catch (error) {
        if (error instanceof PathEscapeError || error instanceof PathDeniedError) {
          return Promise.reject(new ToolError("read_file", error.message))
        }
        return Promise.reject(error instanceof Error ? error : new Error(String(error)))
      }
      return Bun.file(safePath).text()
    }
  }),
  // The model's arguments, not yet checked: a dotfile in the workspace asks first
  approval: args => hiddenPathApproval("Read", args?.path)
}
