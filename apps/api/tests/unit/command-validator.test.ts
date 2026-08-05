import { describe, expect, test } from "bun:test"
import { validateCommand } from "../../src/services/command-validator"

describe("validateCommand", () => {
  test("accepts allowlisted commands without args", () => {
    expect(validateCommand({ command: "uptime", timeoutSeconds: 30 })).toBeNull()
    expect(validateCommand({ command: "ls", timeoutSeconds: 30 })).toBeNull()
  })

  test("accepts safe string args", () => {
    expect(
      validateCommand({
        command: "echo",
        args: { message: "hello world", count: 3 },
        timeoutSeconds: 30
      })
    ).toBeNull()
  })

  test("rejects non-allowlisted commands", () => {
    const err = validateCommand({ command: "rm", timeoutSeconds: 30 })
    expect(err).toContain("not permitted")
  })

  test("rejects out-of-range timeout", () => {
    expect(validateCommand({ command: "uptime", timeoutSeconds: 0 })).toContain("Timeout")
    expect(validateCommand({ command: "uptime", timeoutSeconds: 3601 })).toContain("Timeout")
  })

  test("rejects shell metacharacters in string args", () => {
    const cases = [
      "foo; rm -rf /",
      "a|b",
      "a&b",
      "echo `id`",
      "$(whoami)",
      "a > /tmp/x",
      "a < /etc/passwd",
      "line1\nline2",
      "a\rb"
    ]
    for (const value of cases) {
      const err = validateCommand({
        command: "echo",
        args: { message: value },
        timeoutSeconds: 30
      })
      expect(err).toContain("dangerous characters")
    }
  })

  test("rejects non-object args", () => {
    expect(
      validateCommand({
        command: "echo",
        args: ["not", "an", "object"] as any,
        timeoutSeconds: 30
      })
    ).toContain("plain object")
  })
})
