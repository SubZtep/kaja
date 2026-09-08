import meow from "meow"
import pkg from "../../package.json"
import { t } from "../i18n"

export const args = meow(t("args.help", { version: pkg.version }), {
  importMeta: import.meta,
  flags: {
    continue: {
      type: "boolean",
      shortFlag: "c"
    },
    session: {
      type: "string",
      shortFlag: "s"
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
