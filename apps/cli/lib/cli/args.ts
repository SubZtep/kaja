import meow from "meow"
import { getConfigDir } from "../config/config"
import { t } from "../i18n"
import { listPaths } from "../paths"

export const cli = meow(t("args.help"), {
  importMeta: import.meta,
  flags: {
    // Consumed by the argv pre-scan in cli.ts before this module loads;
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
    // Runs the local agent loop against your own provider instead of the
    // default hosted login.
    local: {
      type: "boolean"
    }
  }
})

if (cli.flags.paths) {
  for (const { label, path } of listPaths(true, getConfigDir())) console.log(`${label}: ${path}`)
  process.exit(0)
}
