import { join } from "node:path"
import { writeTemplateConfig } from "../config/fetch"
import { getPersonasDir, TEMPLATES } from "./personas"

/** The `kaja config fetch` subcommand: (re-)writes each bundled docs/config/personas/<id>.toml template, backing up any existing (differing) file first. */
export async function fetchPersonasToml(): Promise<{ path: string; backedUpTo?: string; unchanged?: boolean }[]> {
  const dir = getPersonasDir()
  return Promise.all(Object.entries(TEMPLATES).map(([id, text]) => writeTemplateConfig(text, join(dir, `${id}.toml`))))
}
