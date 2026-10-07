import { expect, test } from "bun:test"
import { launchLine, McpRunnerMissingError, resolveLaunch } from "../../src/mcp/launch"

const SELF = "/opt/kaja/kaja"
/** A PATH holding just `programs`, each in /usr/bin. */
const pathWith =
  (...programs: string[]) =>
  (program: string) =>
    programs.includes(program) ? `/usr/bin/${program}` : null

const ability = (input: { command?: string; package?: Record<string, string>; args?: string[] }) => ({
  name: "demo",
  args: [],
  ...input
})

/** The programs the error says would do, or the launch when it didn't throw. */
function needs(run: () => unknown): string[] | unknown {
  try {
    return run()
  } catch (error) {
    if (error instanceof McpRunnerMissingError) return error.needs
    throw error
  }
}

test("a command runs as written when it's installed, and needs itself otherwise", () => {
  const command = ability({ command: "uvx", args: ["mcp-server-time"] })
  expect(resolveLaunch(command, { K: "v" }, { which: pathWith("uvx") })).toEqual({
    command: "uvx",
    args: ["mcp-server-time"],
    env: { K: "v" }
  })
  expect(needs(() => resolveLaunch(command, {}, { which: pathWith() }))).toEqual(["uvx"])
})

test("an npm package runs on Kaja's own bun first, as bunx, with the server's args after it", () => {
  const npm = ability({ package: { npm: "@scope/server@1.2.3" }, args: ["/tmp"] })
  const launch = resolveLaunch(npm, { K: "v" }, { which: pathWith("npx"), self: SELF })
  expect(launch).toEqual({
    command: SELF,
    args: ["x", "@scope/server@1.2.3", "/tmp"],
    env: { K: "v", BUN_BE_BUN: "1" }
  })
  expect(launchLine(launch)).toBe("bunx @scope/server@1.2.3 /tmp")
})

test("without Kaja's bun, npm packages go through npx, then pnpm dlx", () => {
  const npm = ability({ package: { npm: "server@1.0.0" } })
  expect(resolveLaunch(npm, {}, { which: pathWith("npx", "pnpm"), self: false })).toMatchObject({
    command: "/usr/bin/npx",
    args: ["-y", "server@1.0.0"]
  })
  const pnpm = resolveLaunch(npm, {}, { which: pathWith("pnpm"), self: false })
  expect(launchLine(pnpm)).toBe("pnpm dlx server@1.0.0")
  expect(needs(() => resolveLaunch(npm, {}, { which: pathWith(), self: false }))).toEqual(["npx", "pnpm"])
})

test("a PyPI package goes through uvx, then pipx with a pinned requirement", () => {
  const pypi = ability({ package: { pypi: "mcp-server-time@2026.8.18" }, args: ["--local-timezone=UTC"] })
  expect(launchLine(resolveLaunch(pypi, {}, { which: pathWith("uvx", "pipx") }))).toBe(
    "uvx mcp-server-time@2026.8.18 --local-timezone=UTC"
  )
  expect(launchLine(resolveLaunch(pypi, {}, { which: pathWith("pipx") }))).toBe(
    "pipx run --spec mcp-server-time==2026.8.18 mcp-server-time --local-timezone=UTC"
  )
})

test("Docker comes last, with env vars going in by name only", () => {
  const both = ability({ package: { pypi: "mcp-server-time@1.0", docker: "mcp/time:1" }, args: ["--x"] })
  expect(launchLine(resolveLaunch(both, {}, { which: pathWith("uvx", "docker") }))).toStartWith("uvx ")

  const launch = resolveLaunch(both, { API_KEY: "secret" }, { which: pathWith("docker") })
  expect(launch).toEqual({
    command: "/usr/bin/docker",
    args: ["run", "-i", "--rm", "--init", "-e", "API_KEY", "mcp/time:1", "--x"],
    env: { API_KEY: "secret" }
  })
  expect(launch.args.join(" ")).not.toContain("secret")
})

test("with nothing installed, the error names every program that would do, in order", () => {
  const both = ability({ package: { pypi: "mcp-server-time@1.0", docker: "mcp/time:1" } })
  expect(needs(() => resolveLaunch(both, {}, { which: pathWith() }))).toEqual(["uvx", "pipx", "docker"])
  expect(() => resolveLaunch(both, {}, { which: pathWith() })).toThrow("demo needs uvx, pipx, docker installed")
})
