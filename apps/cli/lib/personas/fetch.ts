import { join } from "node:path"
import { fetchTomlConfig } from "../config/fetch"
import { getPersonasDir } from "./personas"

/** Leading underscore avoids colliding with real per-persona files (id.toml) and marks it as fetched, not hand-authored. */
export function getFetchedPersonasPath() {
  return join(getPersonasDir(), "_fetched.toml")
}

/** The `kaja config fetch` subcommand: downloads the server-rendered personas.toml (docs/config/personas/*.toml, combined) and writes it to the local config dir, backing up any existing file first. */
export async function fetchPersonasToml(
  apiBaseUrl: string,
  token?: string
): Promise<{ path: string; backedUpTo?: string; unchanged?: boolean }> {
  return fetchTomlConfig(apiBaseUrl, "/config/personas.toml", getFetchedPersonasPath(), token)
}
