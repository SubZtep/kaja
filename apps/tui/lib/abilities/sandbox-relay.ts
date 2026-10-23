import type { McpSandbox } from "@kaja/nasi"
import { SANDBOX_RELAY_KEY_HEADER } from "@kaja/schema/api"
import type { ToolHost } from "@kaja/schema/config"
import { loadToken } from "../auth/credentials"
import { getApiBaseUrl } from "../config/api-url"
import { readConfigLoose } from "../config/config"
import { log } from "../logger"

/**
 * Each ability's host from settings.toml's `[tools.hosts]`; one that isn't listed follows the mode. Tolerant: none
 * before setup, or with a broken file.
 */
export async function toolHosts(): Promise<Record<string, ToolHost>> {
  return (await readConfigLoose()).tools?.hosts ?? {}
}

/** The `[tools.hosts]` key that lets the cloud's model use this computer's shell; not an ability. */
export const SHELL_HOST_KEY = "shell"

/** The abilities settings.toml sends to a sandbox. */
export async function sandboxedAbilities(): Promise<string[]> {
  return Object.entries(await toolHosts()).flatMap(([name, host]) =>
    host === "sandbox" && name !== SHELL_HOST_KEY ? [name] : []
  )
}

/**
 * Where `--local` sends the stdio abilities set to run on a sandbox: the Kaja API's relay, signed in with the stored
 * cloud token, each ability's key (from secrets.toml) in its own header. Undefined without a token: those abilities are
 * then off, never started here instead.
 */
export async function sandboxRelay(keyOf: (ability: string) => string | undefined): Promise<McpSandbox | undefined> {
  const token = await loadToken().catch(error => {
    log.warn("Couldn't read the cloud token for the sandbox relay", { error })
    return undefined
  })
  return token ? relayTo(getApiBaseUrl(), token, keyOf) : undefined
}

/** The relay at `api` with `token`: a sandboxed target's request goes to `/sandbox/relay/mcp/<ability>`. */
export function relayTo(api: string, token: string, keyOf: (ability: string) => string | undefined): McpSandbox {
  return {
    fetch: (input, init) => {
      const ability = decodeURIComponent(new URL(String(input)).pathname.replace(/^\/mcp\//, ""))
      const headers = new Headers(init?.headers)
      headers.set("authorization", `Bearer ${token}`)
      const key = keyOf(ability)
      if (key) headers.set(SANDBOX_RELAY_KEY_HEADER, key)
      return fetch(`${api}/sandbox/relay/mcp/${encodeURIComponent(ability)}`, { ...init, headers })
    }
  }
}

/** Stands in for the relay when there's no token: every request is refused at once, so those abilities stay off. */
export const signedOutSandbox: McpSandbox = {
  fetch: () => Promise.resolve(Response.json({ error: "not signed in to Kaja cloud" }, { status: 401 }))
}
