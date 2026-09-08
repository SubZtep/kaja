import { expect, test } from "bun:test"
import { connectMcpServer } from "../../../lib/mcp/client"

test("rejects when the configured command doesn't exist, instead of hanging", async () => {
  await expect(
    connectMcpServer({ id: "broken", command: "kaja-test-nonexistent-command", args: [], env: {} })
  ).rejects.toThrow()
})
