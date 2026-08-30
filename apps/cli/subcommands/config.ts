import type { args as Args } from "../lib/cli/args"
import { readSecretsLoose } from "../lib/config/secrets"
import { services } from "../lib/config/services"

/**
 * `kaja config fetch` is how to fetch fresh config files
 */
export async function runConfigSubcommand(args: typeof Args) {
  const { runConfigCli } = await import("../lib/config/cli")
  const resolvedServices = await services()
  const looseSecrets = await readSecretsLoose()
  const { code, text } = await runConfigCli(args.input.slice(1), resolvedServices, looseSecrets)
  console.log(text)
  process.exit(code)
}
