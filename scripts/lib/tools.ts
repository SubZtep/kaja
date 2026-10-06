import { join } from "node:path"

const rootDir = join(import.meta.dir, "../..")

type Tool = { install: string; npm: string; pinned: () => Promise<string> }

/** CLIs the repo runs from the machine, not from node_modules: where to get each, and the version it expects. */
export const TOOLS = {
  biome: {
    install: "https://biomejs.dev/guides/manual-installation/",
    npm: "@biomejs/biome",
    // The version biome.json's $schema URL names
    pinned: async () => {
      const config = await Bun.file(join(rootDir, "biome.json")).json()
      const version = /\/schemas\/([^/]+)\//.exec(config.$schema)?.[1]
      if (!version) throw new Error("biome.json's $schema names no version")
      return version
    }
  },
  tombi: {
    install: "https://tombi-toml.github.io/tombi/docs/installation",
    npm: "tombi",
    pinned: async () => "1.7.3"
  }
} satisfies Record<string, Tool>

export type ToolName = keyof typeof TOOLS

/** Path of the installed `name` CLI, warning on stderr when its version isn't the pinned one; throws with install help when it isn't on the PATH. */
export async function toolPath(name: ToolName): Promise<string> {
  const tool = TOOLS[name]
  const version = await tool.pinned()
  const path = Bun.which(name)
  if (!path) {
    throw new Error(
      `${name} isn't installed. Install the CLI (${version}): ${tool.install} or \`bun add -g ${tool.npm}@${version}\``
    )
  }
  const installed = /\d+\.\d+\.\d+/.exec(Bun.spawnSync([path, "--version"]).stdout.toString())?.[0]
  if (installed !== version) {
    console.error(
      `${name} ${installed ?? "(unknown version)"} is installed, but the repo expects ${version}: its output may differ from CI's.`
    )
  }
  return path
}
