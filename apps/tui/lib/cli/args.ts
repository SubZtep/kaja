import { parseArgs } from "node:util"
import pkg from "../../package.json"
import { t } from "../i18n"

const options = {
  continue: {
    type: "boolean",
    short: "c"
  },
  session: {
    type: "string",
    short: "s"
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
  },
  help: {
    type: "boolean"
  },
  version: {
    type: "boolean"
  }
} as const

function parse() {
  try {
    return parseArgs({ args: Bun.argv.slice(2), options, strict: true, allowPositionals: true })
  } catch (error) {
    // meow ignored unknown flags and started the TUI anyway, so a typo'd --sesion silently did nothing.
    // Node appends advice about `--` for positionals starting with a dash; that's noise here, so keep the first sentence.
    const raw = error instanceof Error ? error.message : String(error)
    const message = raw.split(". ")[0] ?? raw
    console.log(t("args.unknownFlag", { message }))
    process.exit(1)
  }
}

const { values, positionals } = parse()

// meow served --help and --version itself; parseArgs only parses, so without this the entry point falls through to the TUI.
if (values.help) {
  console.log(t("args.help", { version: pkg.version }))
  process.exit(0)
}

if (values.version) {
  console.log(pkg.version)
  process.exit(0)
}

export const args = {
  input: positionals,
  flags: values
}
