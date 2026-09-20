import type { args as Args } from "../lib/cli/args"

/**
 * `kaja config fetch` is how to fetch fresh config files
 */
export async function runConfigSubcommand(args: typeof Args) {
  const { runConfigCli } = await import("../lib/config/cli")
  // Flags come from args.flags, not the positionals: parseArgs strips them out of `input`, so
  // `--offline`/`--only`/`--headless` never reached the handlers when they were scanned from there.
  const { code, text } = await runConfigCli(args.input.slice(1), args.flags)
  console.log(text)
  process.exit(code)
}
