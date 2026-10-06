import { join } from "node:path"

const rootDir = join(import.meta.dir, "../..")

/** Every biome.json git tracks: the root one and the packages' that extend it. */
function biomeConfigs(): string[] {
  const out = Bun.spawnSync(["git", "ls-files", "--", ":(glob)**/biome.json"], { cwd: rootDir }).stdout.toString()
  return out.split("\n").filter(Boolean)
}

type Tool = { install: string; npm: string; pinned: () => Promise<string> }

/** CLIs the repo runs from the machine, not from node_modules: where to get each, and the version it expects. */
export const TOOLS = {
  biome: {
    install: "https://biomejs.dev/guides/manual-installation/",
    npm: "@biomejs/biome",
    // The version biome.json's $schema URL names; the packages' configs must name the same one
    pinned: async () => {
      const versions = await Promise.all(
        biomeConfigs().map(async path => {
          const config = await Bun.file(join(rootDir, path)).json()
          return { path, version: /\/schemas\/([^/]+)\//.exec(config.$schema ?? "")?.[1] }
        })
      )
      const version = versions.find(config => config.path === "biome.json")?.version
      if (!version) throw new Error("biome.json's $schema names no version")
      const stray = versions.filter(config => config.version !== version)
      if (stray.length > 0) {
        const list = stray.map(config => `${config.path} (${config.version ?? "none"})`).join(", ")
        throw new Error(`Every biome.json's $schema must name Biome ${version}, not: ${list}`)
      }
      return version
    }
  },
  tombi: {
    install: "https://tombi-toml.github.io/tombi/docs/installation",
    npm: "tombi",
    pinned: () => Promise.resolve("1.7.3")
  }
} satisfies Record<string, Tool>

export type ToolName = keyof typeof TOOLS

/** Path of the installed `name` CLI, warning on stderr when its major.minor version isn't the pinned one's (patches may differ); throws with install help when it isn't on the PATH. */
export async function toolPath(name: ToolName): Promise<string> {
  const tool = TOOLS[name]
  const version = await tool.pinned()
  const path = Bun.which(name)
  if (!path) {
    throw new Error(
      `${name} isn't installed. Install the CLI (${version}): ${tool.install} or \`bun add -g ${tool.npm}@${version}\``
    )
  }
  // The first whole word that is a version (anchored per word, so the regex can't backtrack across the output)
  const installed = Bun.spawnSync([path, "--version"])
    .stdout.toString()
    .split(/\s+/)
    .find(word => /^\d+\.\d+\.\d+$/.test(word))
  // major.minor only: a patch release shouldn't change the output
  const minor = (v?: string) => v?.split(".").slice(0, 2).join(".")
  if (minor(installed) !== minor(version)) {
    console.error(
      `${name} ${installed ?? "(unknown version)"} is installed, but the repo expects ${version}: its output may differ from CI's.`
    )
  }
  return path
}
