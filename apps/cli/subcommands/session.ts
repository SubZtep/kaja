import type { cli as Cli } from "../lib/cli/args"

/** Runs before the config guard: browsing/fixing sessions must work even with a missing or invalid LLM config. */
export async function runSessionSubcommand(cli: typeof Cli) {
  const { runSessionCli } = await import("../lib/session/cli")
  const { code, text } = await runSessionCli(cli.input.slice(1))
  console.log(text)
  process.exit(code)
}
