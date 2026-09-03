import meow from "meow"
import { t } from "../i18n"

export const args = meow(t("args.help"), {
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
    /** Selects/switches the hosted (--remote) account by email; overrides the last signed-in user from settings.toml. */
    user: {
      type: "string"
    },
    /** No Ink render — for a subcommand that doesn't need a terminal (e.g. telegram). */
    headless: {
      type: "boolean"
    }
  }
})
