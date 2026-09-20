import { checkHttpToolKey, connectMcpServer, type McpConnectOptions } from "@kaja/nasi"
import type { HttpToolAbility } from "@kaja/schema/abilities"
import type { CliResolvedModel, McpServerEntry } from "@kaja/schema/config"
import { t } from "../i18n"
import { probeModel } from "../models/check"
import { getPaths } from "../paths"

/**
 * A credential's live test: it works, or why not.
 *
 * `kind` separates "the service looked at this value and refused it" from "the service was never
 * reached, so the value was never judged". Only the first is worth asking the user to retype —
 * a local model server that isn't running needs starting, not a new API key. Absent means
 * "credential": every other check here only runs against a service that answered.
 */
export type CheckResult = { ok: true } | { ok: false; reason: string; kind?: "credential" | "unreachable" }

const TIMEOUT_MS = 15_000
const OK: CheckResult = { ok: true }

/** The error as text, with the secret masked in case the message echoes a URL or header. */
function failure(error: unknown, secret?: string): CheckResult {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, reason: secret ? message.replaceAll(secret, "•••") : message }
}

async function httpFailure(res: Response): Promise<CheckResult> {
  const body = (await res.json().catch(() => undefined)) as { description?: unknown } | undefined
  const detail = typeof body?.description === "string" ? `: ${body.description}` : ""
  return { ok: false, reason: `HTTP ${res.status}${detail}` }
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(t("doctor.checkTimeout"))), TIMEOUT_MS))
  ])
}

/** Sends one tiny request to the provider's model (the same probe the models report uses). */
export async function checkProvider(model: CliResolvedModel, apiKey: string | undefined): Promise<CheckResult> {
  const probe = await probeModel({ ...model, apiKey })
  if (probe.ok) return OK
  const reason = t("doctor.checkModelFailed", { model: model.model, error: probe.error })
  // Only an outright rejection is about the key. A refused connection, a 404 for the model, a 500 —
  // none of those mean the key is wrong, and Ollama/llama.cpp don't take one at all.
  const kind = probe.status === 401 || probe.status === 403 ? "credential" : "unreachable"
  return { ok: false, reason: apiKey ? reason.replaceAll(apiKey, "•••") : reason, kind }
}

/** Runs the ability's `check` request with `apiKey`; undefined when the manifest has no `check`. Local, so private hosts are fine. */
export function checkAbilityKey(ability: HttpToolAbility, apiKey: string): Promise<CheckResult | undefined> {
  return checkHttpToolKey(ability, apiKey, { allowPrivate: true })
}

/** Connects to the server and lists its tools, then disconnects. */
export async function checkMcpServer(server: McpServerEntry, opts?: McpConnectOptions): Promise<CheckResult> {
  try {
    const { close } = await withTimeout(connectMcpServer(server, getPaths().temp, opts))
    await close()
    return OK
  } catch (error) {
    return failure(error)
  }
}

/** Telegram's getMe: 200 means the token belongs to a live bot. */
export async function checkTelegramToken(token: string): Promise<CheckResult> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    return res.ok ? OK : await httpFailure(res)
  } catch (error) {
    return failure(error, token)
  }
}

/** One Brave query against the endpoint web_search uses; it counts toward the key's quota. */
export async function checkWebSearchKey(apiKey: string): Promise<CheckResult> {
  try {
    const res = await fetch("https://api.search.brave.com/res/v1/llm/context?q=kaja", {
      headers: { "X-Subscription-Token": apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    return res.ok ? OK : { ok: false, reason: `HTTP ${res.status}` }
  } catch (error) {
    return failure(error, apiKey)
  }
}
