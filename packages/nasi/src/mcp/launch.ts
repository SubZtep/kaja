import type { McpAbility, McpPackage } from "@kaja/schema/abilities"
import type { RootFolder } from "./roots"

/** How to start one stdio server on this host. */
export type StdioLaunch = { command: string; args: string[]; env: Record<string, string> }

export type LaunchOptions = {
  /** Finds a program on PATH (default `Bun.which`); tests pass their own. */
  which?: (program: string) => string | null
  /**
   * Kaja's own executable, which runs npm packages as bunx (`BUN_BE_BUN=1`), with Node when it's installed and on
   * itself otherwise. Default `process.execPath`; false skips it (the sandbox, whose bun cache can't be shared between uids).
   */
  self?: string | false
}

/** Why a stdio ability can't start here: none of the programs that could run it is installed. */
export class McpRunnerMissingError extends Error {
  readonly ability: string
  /** The programs that would do, in the order they're tried, e.g. ["uvx", "pipx", "docker"]. */
  readonly needs: string[]

  constructor(ability: string, needs: string[]) {
    super(`${ability} needs ${needs.join(", ")} installed`)
    this.name = "McpRunnerMissingError"
    this.ability = ability
    this.needs = needs
  }
}

type Runner = { program: string; args: (spec: string) => string[] }

// npx and pnpm dlx find the package's one bin themselves. (Yarn is left out: v1 has no dlx, and Berry's guesses the bin from the package name.)
const NPM_RUNNERS: Runner[] = [
  { program: "npx", args: spec => ["-y", spec] },
  { program: "pnpm", args: spec => ["dlx", spec] }
]
// uvx takes name@version; pipx wants a pip requirement, so the command is named like the package.
const PYPI_RUNNERS: Runner[] = [
  { program: "uvx", args: spec => [spec] },
  { program: "pipx", args: spec => ["run", "--spec", spec.replace("@", "=="), spec.split("@")[0]!] }
]

/**
 * How to start a stdio ability here, with `env` (its static env vars and key) for the server: a manifest's
 * `command` as it is, or its `package` through the first runner this host has (npm, then PyPI, then Docker). `folders`
 * are the ones the server may work in (its roots): a container gets each mounted at the same path, read-only ones so. Throws
 * {@link McpRunnerMissingError} when nothing installed can start it.
 */
export function resolveLaunch(
  ability: Pick<McpAbility, "name" | "command" | "package" | "args">,
  env: Record<string, string>,
  opts: LaunchOptions = {},
  folders: RootFolder[] = []
): StdioLaunch {
  const which = opts.which ?? Bun.which
  if (ability.command) {
    if (!which(ability.command)) throw new McpRunnerMissingError(ability.name, [ability.command])
    return { command: ability.command, args: ability.args, env }
  }
  const pkg: McpPackage = ability.package ?? {}
  const self = opts.self ?? process.execPath
  if (pkg.npm && self) return { command: self, args: ["x", pkg.npm, ...ability.args], env: { ...env, BUN_BE_BUN: "1" } }
  const tried: string[] = []
  const viaRunner = (runners: Runner[], spec: string | undefined): StdioLaunch | undefined => {
    if (!spec) return undefined
    for (const runner of runners) {
      tried.push(runner.program)
      const path = which(runner.program)
      if (path) return { command: path, args: [...runner.args(spec), ...ability.args], env }
    }
    return undefined
  }
  const launch = viaRunner(NPM_RUNNERS, pkg.npm) ?? viaRunner(PYPI_RUNNERS, pkg.pypi)
  if (launch) return launch
  if (pkg.docker) {
    tried.push("docker")
    const docker = which("docker")
    if (docker) return dockerLaunch(docker, pkg.docker, ability.args, env, folders)
  }
  throw new McpRunnerMissingError(ability.name, tried)
}

/**
 * `docker run` of the image, its stdin kept open for MCP. Each env var goes in by name only (`-e NAME`, the value comes
 * from docker's own env), so a key never shows in the process list. Each folder is mounted at its own path, so the
 * paths the model sees are the user's.
 */
function dockerLaunch(
  docker: string,
  image: string,
  serverArgs: string[],
  env: Record<string, string>,
  folders: RootFolder[]
): StdioLaunch {
  const envFlags = Object.keys(env).flatMap(name => ["-e", name])
  const mounts = folders.flatMap(({ folder, readOnly }) => [
    "--mount",
    ["type=bind", csvField(`src=${folder}`), csvField(`dst=${folder}`), ...(readOnly ? ["readonly"] : [])].join(",")
  ])
  return { command: docker, args: ["run", "-i", "--rm", "--init", ...envFlags, ...mounts, image, ...serverArgs], env }
}

// --mount is CSV: a field with a comma or quote is quoted, its quotes doubled.
function csvField(field: string): string {
  return /[",]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field
}

/** The launch as one line for people to read, e.g. `uvx mcp-server-time@1.0`; Kaja's own bun shows as `bunx`. */
export function launchLine(launch: StdioLaunch): string {
  const own = launch.env.BUN_BE_BUN === "1" && launch.args[0] === "x"
  const [command, args] = own ? ["bunx", launch.args.slice(1)] : [basename(launch.command), launch.args]
  return [command, ...args].join(" ")
}

// The program's name without its folder (a runner's path from `which`), on either separator.
function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}
