import meow from "meow"
import { getConfigDir } from "../config/config"
import { t } from "../i18n"
import { listPaths } from "../paths"

// Injected at compile time by CI via `bun build --define CLI_VERSION=...`
// with the package.json version; undefined when running from source, where
// meow reads package.json itself.
declare const CLI_VERSION: string | undefined

export const cli = meow(t("args.help"), {
  importMeta: import.meta,
  ...(typeof CLI_VERSION === "string" ? { version: CLI_VERSION } : {}),
  flags: {
    // Consumed by the argv pre-scan in cli.tsx before this module loads;
    // declared here so meow's --help lists it and parsing accepts it.
    config: {
      type: "string"
    },
    paths: {
      type: "boolean"
    },
    continue: {
      type: "boolean",
      shortFlag: "c"
    },
    session: {
      type: "string",
      shortFlag: "s"
    },
    // Only used by the `kaja web` subcommand.
    port: {
      type: "number",
      default: 4880
    },
    // Only used by `kaja config fetch`: lets it run before services.toml has
    // an [api] section (e.g. right after first run), and gets persisted
    // there afterward so future fetches don't need it.
    apiUrl: {
      type: "string"
    }
  }
})

if (cli.flags.paths) {
  for (const { label, path } of listPaths(true, getConfigDir())) console.log(`${label}: ${path}`)
  process.exit(0)
}
