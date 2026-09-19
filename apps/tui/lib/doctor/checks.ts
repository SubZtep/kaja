import {
  checkHttpToolKey,
  connectMcpServer,
  lookupMyLocation,
  type McpConnectOptions,
  resetLocationCache
} from "@kaja/nasi"
import type { CliResolvedModel, McpServerEntry } from "@kaja/schema/config"
import type { HttpToolPackage } from "@kaja/schema/packages"
import { t } from "../i18n"
import { probeModel } from "../models/check"
import { getPaths } from "../paths"

/** A credential's live test: it works, or why not. */
export type CheckResult = { ok: true } | { ok: false; reason: string }

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
  return { ok: false, reason: apiKey ? reason.replaceAll(apiKey, "•••") : reason }
}

/** Runs the package's `check` request with `apiKey`; undefined when the manifest has no `check`. Local, so private hosts are fine. */
export function checkPackageKey(pkg: HttpToolPackage, apiKey: string): Promise<CheckResult | undefined> {
  return checkHttpToolKey(pkg, apiKey, { allowPrivate: true })
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

/** A real geo lookup of this machine's public IP; the process-wide cache is cleared on both sides so the key is really used. */
export async function checkLocationKey(serviceUrl: string, apiKey: string): Promise<CheckResult> {
  resetLocationCache()
  try {
    await withTimeout(lookupMyLocation({ serviceUrl, apiKey }))
    return OK
  } catch (error) {
    return failure(error, apiKey)
  } finally {
    resetLocationCache()
  }
}
