import type { cli as Cli } from "../lib/cli/args"
import { readSecretsLoose } from "../lib/config/secrets"
import { readServicesLoose } from "../lib/config/services"

/**
 * `kaja config fetch` is how a fresh install (or a broken one) gets real
 * settings.toml/models.toml files in the first place, so it must run before
 * the config guard, without any of them already in place. It needs
 * services.toml's [api] baseUrl (and secrets.toml's [api] token) to already
 * be set.
 */
export async function runConfigSubcommand(cli: typeof Cli) {
  const { runConfigCli } = await import("../lib/config/cli")
  const looseServices = await readServicesLoose()
  const looseSecrets = await readSecretsLoose()
  const { code, text } = await runConfigCli(cli.input.slice(1), looseServices, looseSecrets)
  console.log(text)
  process.exit(code)
}
