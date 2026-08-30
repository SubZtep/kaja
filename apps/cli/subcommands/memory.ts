import type { args as Cli } from "../lib/cli/args"

/** Runs before the config guard: browsing/fixing memory must work even with a missing or invalid LLM config. */
export async function runMemorySubcommand(cli: typeof Cli) {
  const { runMemoryCli } = await import("../lib/memory/cli")
  const { code, text } = await runMemoryCli(cli.input.slice(1))
  console.log(text)
  process.exit(code)
}
