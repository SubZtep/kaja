type Tool = { install: string; npm: string; pinned: () => Promise<string> }

/** CLIs the repo runs from the machine, not from node_modules: where to get each, and the version it expects. */
export const TOOLS = {
  tombi: {
    install: "https://tombi-toml.github.io/tombi/docs/installation",
    npm: "tombi",
    pinned: () => Promise.resolve("1.8.10")
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
