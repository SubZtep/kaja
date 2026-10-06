import { expect, test } from "bun:test"
import { runShellCommand } from "../../src/agent/run-command"

test("a short command comes back with its exit code and stdout", async () => {
  const result = await runShellCommand("printf hi")
  expect(result).toContain("Exit code: 0")
  expect(result).toContain("hi")
  expect(result).not.toContain("Output cut")
  expect(result).not.toContain("Timed out")
})

test("a stream past the cap is cut and the child is killed", async () => {
  const result = await runShellCommand("yes a", { maxBytes: 100, timeoutMs: 5_000 })
  expect(result).toContain("Output cut at 100 bytes")
  expect(result.length).toBeLessThan(500)
})

test("a command that ignores its pipes is killed at the timeout", async () => {
  const started = Date.now()
  const result = await runShellCommand("sleep 30", { timeoutMs: 200 })
  expect(Date.now() - started).toBeLessThan(5_000)
  expect(result).toContain("Timed out after 200 ms")
})
