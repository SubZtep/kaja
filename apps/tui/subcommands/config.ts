import type { args as Args } from "../lib/cli/args"

/**
 * `kaja config fetch` is how to fetch fresh config files
 */
export async function runConfigSubcommand(args: typeof Args) {
  const { runConfigCli } = await import("../lib/config/cli")
  const { code, text } = await runConfigCli(args.input.slice(1))
  console.log(text)
  process.exit(code)
}
