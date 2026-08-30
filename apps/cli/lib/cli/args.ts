import meow from "meow"
import { getConfigDir } from "../config/config"
import { t } from "../i18n"
import { listPaths } from "../paths"

export const args = meow(t("args.help"), {
  importMeta: import.meta,
  flags: {
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
    /** Only used by the `kaja web` subcommand. */
    port: {
      type: "number",
      default: 4880
    },
    /** Forces the local agent loop against your own provider, even without a local config yet. */
    local: {
      type: "boolean"
    },
    /** Forces hosted login even if a local config exists. */
    remote: {
      type: "boolean"
    },
    /** No Ink render — for a subcommand that doesn't need a terminal (e.g. telegram). */
    headless: {
      type: "boolean"
    }
  }
})

if (args.flags.paths) {
  for (const { label, path } of listPaths(true, getConfigDir())) console.log(`${label}: ${path}`)
  process.exit(0)
}
