import { z } from "zod"
import { ToolError, tool } from "../../agent/agent"
import { guardWorkspacePath, PathDeniedError, PathEscapeError } from "../path-guard"

/**
 * Reads a text file from disk.
 *
 * @param args.path - Path to the file to read.
 * @returns The file's contents as a string.
 */
export const readFileTool = tool({
  name: "read_file",
  description: "Read a text file",
  schema: z.object({
    path: z.string().describe("Path to the file")
  }),
  execute: async args => {
    let safePath: string
    try {
      safePath = guardWorkspacePath(args.path)
    } catch (error) {
      if (error instanceof PathEscapeError || error instanceof PathDeniedError) {
        throw new ToolError("read_file", error.message)
      }
      throw error
    }
    return await Bun.file(safePath).text()
  }
})
