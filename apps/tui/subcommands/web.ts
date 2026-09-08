import type { args as Cli } from "../lib/cli/args"

/** Runs before the config guard: browsing/fixing config must work even with a missing or invalid LLM config. */
export async function runWebSubcommand(cli: typeof Cli) {
  const { runWebCli } = await import("../lib/web/cli")
  process.exit(await runWebCli({ port: cli.flags.port }))
}
