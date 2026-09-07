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
    },
    /** Overrides the UI/reply language ("en", "hu", or "nan-TW") for this run, stronger than the saved config preference. Actually applied in lib/cli/bootstrap.ts's detectAndSetLanguage, which reads it straight from argv before this module (and its --help text) can be built — declared here only so --help documents it and meow doesn't warn on an unknown flag. */
    lang: {
      type: "string"
    }
  }
})
