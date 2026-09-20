import { createFolderAbilityStore, mcpAbilityTarget } from "@kaja/nasi"
import type { CliResolvedModel, McpServerEntry, SecretsFile } from "@kaja/schema/config"
import { getMarketplaceDir, loadAbilitiesFile } from "../abilities/abilities-file"
import { loadMcpServers } from "../config/mcp-servers"
import { saveSecrets, secrets } from "../config/secrets"
import { readServicesLoose } from "../config/services"
import { t } from "../i18n"
import { loadModelsFile, resolveModels } from "../models/models"
import {
  type CheckResult,
  checkAbilityKey,
  checkLocationKey,
  checkMcpServer,
  checkProvider,
  checkTelegramToken,
  checkWebSearchKey
} from "./checks"

/** One key or token the current config depends on, with how to test and store it. */
export type CredentialItem = {
  /** Shown in prompts and results, e.g. "fireworks (model provider)". */
  label: string
  /** Its place in secrets.toml, e.g. "[providers.fireworks] api_key" — what the summary tells the user to set. */
  where: string
  /** Where the value goes on the wire, e.g. "header X-Api-Key", so the user knows which key is meant. */
  hint?: string
  present: boolean
  /** Missing only counts as a problem when required: a provider without a key may simply not need one (Ollama). */
  required: boolean
  /** Tests `value`, or the saved value when undefined. Absent, or resolving to undefined, when there's no way to test it. */
  check?: (value?: string) => Promise<CheckResult | undefined>
  save: (value: string) => Promise<void>
}

export type CredentialOutcome =
  | { item: CredentialItem; status: "ok" | "keyless" | "untested" | "saved" | "saved-untested" }
  | {
      item: CredentialItem
      status: "missing" | "failing" | "saved-failing"
      reason: string
      /** "unreachable": the service never judged the value, so a new one wouldn't help. */
      kind?: "credential" | "unreachable"
    }

/** How resolveCredentials talks to the user; the doctor passes Ink prompts, tests pass fakes. */
export type CredentialIo = {
  interactive: boolean
  /** Resolves to the entered value, or undefined when skipped. */
  ask: (title: string) => Promise<string | undefined>
  askSaveAnyway: (title: string) => Promise<boolean>
}

/** The model a provider is tested with: its chat model when it has one, otherwise its first. */
function modelsByProvider(models: CliResolvedModel[]): Map<string, CliResolvedModel> {
  const byProvider = new Map<string, CliResolvedModel>()
  for (const model of models) {
    const current = byProvider.get(model.provider)
    if (!current || (model.task === "chat" && current.task !== "chat")) byProvider.set(model.provider, model)
  }
  return byProvider
}

function withSecret(server: McpServerEntry, name: string, value: string): McpServerEntry {
  return "url" in server
    ? { ...server, headers: { ...server.headers, [name]: value } }
    : { ...server, env: { ...server.env, [name]: value } }
}

/**
 * Every credential the current local config relies on: providers used by a configured
 * model, enabled HTTP tool and MCP abilities with key auth, secrets MCP servers declare, and the
 * location/Telegram services when configured (web search only when a key is set: there's
 * no other sign the user wants it).
 */
export async function collectCredentials(): Promise<CredentialItem[]> {
  const creds = await secrets()
  const items: CredentialItem[] = []

  const modelsFile = await loadModelsFile().catch(() => undefined)
  for (const [provider, model] of modelsByProvider(modelsFile ? resolveModels(modelsFile) : [])) {
    const saved = creds.providers[provider]?.api_key
    items.push({
      label: t("doctor.itemProvider", { name: provider }),
      where: `[providers.${provider}] api_key`,
      present: Boolean(saved),
      required: false,
      check: value => checkProvider(model, value ?? saved),
      save: value => saveSecrets({ providers: { [provider]: { api_key: value } } })
    })
  }

  items.push(...(await abilityItems(creds)))

  for (const server of await loadMcpServers()) {
    for (const name of server.secrets ?? []) {
      items.push({
        label: t("doctor.itemMcp", { name: server.id }),
        where: `[mcp.${server.id}] ${name}`,
        hint: `${"url" in server ? "header" : "env"} ${name}`,
        present: Boolean(creds.mcp[server.id]?.[name]),
        required: true,
        // Testable only once every declared name has a value; read live, since an earlier item may have just saved one.
        check: async value => {
          const saved = (await secrets()).mcp[server.id] ?? {}
          const others = (server.secrets ?? []).filter(other => other !== name)
          if (others.some(other => !saved[other])) return undefined
          const current = value ?? saved[name]
          return current ? checkMcpServer(withSecret(server, name, current)) : undefined
        },
        save: async value =>
          saveSecrets({ mcp: { [server.id]: { ...(await secrets()).mcp[server.id], [name]: value } } })
      })
    }
  }

  const services = await readServicesLoose()
  const serviceUrl = services.location?.serviceUrl
  if (serviceUrl) {
    const saved = creds.location?.apiKey
    items.push({
      label: t("doctor.itemLocation"),
      where: "[location] apiKey",
      hint: "header X-API-Key",
      present: Boolean(saved),
      required: true,
      check: async value => {
        const key = value ?? saved
        return key ? checkLocationKey(serviceUrl, key) : undefined
      },
      save: value => saveSecrets({ location: { apiKey: value } })
    })
  }
  if (services.telegram) {
    const saved = creds.telegram?.botToken
    items.push({
      label: t("doctor.itemTelegram"),
      where: "[telegram] botToken",
      present: Boolean(saved),
      required: true,
      check: async value => {
        const token = value ?? saved
        return token ? checkTelegramToken(token) : undefined
      },
      save: value => saveSecrets({ telegram: { botToken: value } })
    })
  }
  const webSearchKey = creds.webSearch?.apiKey
  if (webSearchKey) {
    items.push({
      label: t("doctor.itemWebSearch"),
      where: "[webSearch] apiKey",
      present: true,
      required: false,
      check: value => checkWebSearchKey(value ?? webSearchKey),
      save: value => saveSecrets({ webSearch: { apiKey: value } })
    })
  }

  return items
}

// Enabled HTTP tool and MCP abilities with key auth. An MCP ability is tested by connecting to it.
async function abilityItems(creds: SecretsFile): Promise<CredentialItem[]> {
  const items: CredentialItem[] = []
  const { tools, mcp } = await loadAbilitiesFile()
  const store = createFolderAbilityStore({ root: getMarketplaceDir(), enabled: { skills: [], tools, mcp } })
  for (const ability of await store.listHttpTools()) {
    if (ability.auth.type !== "apiKey") continue
    const saved = creds.abilities[ability.name]?.apiKey
    items.push({
      label: t("doctor.itemAbility", { name: ability.name }),
      where: `[abilities.${ability.name}] apiKey`,
      hint: `${ability.auth.in} ${ability.auth.name}`,
      present: Boolean(saved),
      required: !ability.auth.optional,
      check: async value => {
        const key = value ?? saved
        return key ? checkAbilityKey(ability, key) : undefined
      },
      save: value => saveSecrets({ abilities: { [ability.name]: { apiKey: value } } })
    })
  }
  for (const ability of await store.listMcpAbilities()) {
    const { auth } = ability
    if (auth.type !== "apiKey") continue
    const saved = creds.abilities[ability.name]?.apiKey
    items.push({
      label: t("doctor.itemMcpAbility", { name: ability.name }),
      where: `[abilities.${ability.name}] apiKey`,
      hint: `${auth.in} ${auth.name}`,
      present: Boolean(saved),
      required: !auth.optional,
      // Connecting proves the server is up and takes the key; an optional key without a value tests the keyless connection.
      check: async value => {
        const key = value ?? saved
        if (!key && !auth.optional) return undefined
        const target = mcpAbilityTarget(ability, key)
        return checkMcpServer(target.server, { transport: target.transport === "sse" ? "sse" : "http" })
      },
      save: value => saveSecrets({ abilities: { [ability.name]: { apiKey: value } } })
    })
  }
  return items
}

/** Prompt text for an item that's missing or whose saved value failed its test. */
function askTitle(item: CredentialItem, failingReason: string | undefined): string {
  const hint = item.hint ? ` (${item.hint})` : ""
  return failingReason
    ? t("doctor.askFailing", { label: item.label, reason: failingReason, hint })
    : t("doctor.askMissing", { label: item.label, hint })
}

/**
 * Tests each item and, when interactive, asks for anything missing or failing: the new value
 * is tested before it's saved, and a value that fails its test is saved only if the user says
 * so. Calls `onOutcome` as each item settles, so the doctor can print results as it goes.
 */
export async function resolveCredentials(
  items: CredentialItem[],
  io: CredentialIo,
  onOutcome: (outcome: CredentialOutcome) => void = () => {}
): Promise<CredentialOutcome[]> {
  const outcomes: CredentialOutcome[] = []
  const settle = (outcome: CredentialOutcome) => {
    outcomes.push(outcome)
    onOutcome(outcome)
  }

  for (const item of items) {
    const saved = await savedOutcome(item)
    // Nothing rejected the value, so there's nothing for the user to retype — report and move on.
    const worthAsking = "reason" in saved && io.interactive && saved.kind !== "unreachable"
    settle(worthAsking ? await askAndSave(saved as Extract<CredentialOutcome, { reason: string }>, io) : saved)
  }

  return outcomes
}

// The item as it stands: fine (ok, keyless or untested), or missing or failing its test.
async function savedOutcome(item: CredentialItem): Promise<CredentialOutcome> {
  if (item.required && !item.present) return { item, status: "missing", reason: t("doctor.missing") }
  const current = await item.check?.()
  if (current?.ok === false) return { item, status: "failing", reason: current.reason, kind: current.kind }
  if (!current?.ok) return { item, status: "untested" }
  return { item, status: item.present ? "ok" : "keyless" }
}

// Asks for a new value, tests it, and saves it; one that fails its test is saved only if the user says so.
async function askAndSave(
  problem: Extract<CredentialOutcome, { reason: string }>,
  io: CredentialIo
): Promise<CredentialOutcome> {
  const { item } = problem
  const value = await io.ask(askTitle(item, problem.status === "missing" ? undefined : problem.reason))
  if (!value) return problem

  const tested = await item.check?.(value)
  if (tested?.ok === false) {
    if (!(await io.askSaveAnyway(t("doctor.askSaveAnyway", { label: item.label, reason: tested.reason })))) {
      return { item, status: problem.status, reason: tested.reason, kind: tested.kind }
    }
    await item.save(value)
    return { item, status: "saved-failing", reason: tested.reason, kind: tested.kind }
  }

  await item.save(value)
  return { item, status: tested?.ok ? "saved" : "saved-untested" }
}

/** One result line, e.g. "  ✓ github (ability): saved and working" or "  ✗ telegram bot: missing". */
export function outcomeLine(outcome: CredentialOutcome): string {
  switch (outcome.status) {
    case "ok":
      return `  ✓ ${outcome.item.label}`
    case "keyless":
      return `  ✓ ${outcome.item.label}: ${t("doctor.keyless")}`
    case "untested":
      return `  ✓ ${outcome.item.label}: ${t("doctor.untested")}`
    case "saved":
      return `  ✓ ${outcome.item.label}: ${t("doctor.savedWorking")}`
    case "saved-untested":
      return `  ✓ ${outcome.item.label}: ${t("doctor.savedUntested")}`
    case "saved-failing":
      return `  ✗ ${outcome.item.label}: ${t("doctor.savedFailing", { reason: outcome.reason })}`
    default:
      return `  ✗ ${outcome.item.label}: ${outcome.reason}`
  }
}

/** Whether an outcome still needs the user's attention — what the to-do list and the wizard's closing line key off. */
export function isUnresolved(outcome: CredentialOutcome): boolean {
  return outcome.status === "missing" || outcome.status === "failing" || outcome.status === "saved-failing"
}

/**
 * The keys-and-tokens pass, shared by `kaja doctor` and the setup wizard: tests every credential the
 * current config relies on and, in a terminal, asks for anything missing or failing (tested before
 * it's saved). Prints `header` only when there's actually something to check. Reads the config from
 * disk, so a caller that just wrote one must do so before calling this.
 */
export async function runCredentialPass(print: (line: string) => void, header?: string): Promise<CredentialOutcome[]> {
  // Loaded here rather than at module scope so a non-interactive caller never pulls Ink in.
  const { askSaveAnyway, askSecret } = await import("./prompt")

  const items = await collectCredentials()
  if (items.length === 0) return []
  if (header) print(header)

  return resolveCredentials(
    items,
    { interactive: Boolean(process.stdin.isTTY), ask: askSecret, askSaveAnyway },
    outcome => print(outcomeLine(outcome))
  )
}

/** The closing to-do list: each unresolved item's secrets.toml entry and why, or an all-clear line. */
export function summaryLines(outcomes: CredentialOutcome[], secretsPath: string): string[] {
  const todo = outcomes.filter(isUnresolved)
  if (todo.length === 0) return [t("doctor.allGood")]

  // Pointing at a secrets.toml entry is only advice when a key is actually the problem; an
  // unreachable service is listed separately, by what it is rather than where its key would go.
  const keys = todo.filter(o => !("kind" in o) || o.kind !== "unreachable")
  const unreachable = todo.filter(o => "kind" in o && o.kind === "unreachable")

  return [
    ...(keys.length > 0
      ? [
          t("doctor.todoTitle", { path: secretsPath }),
          ...keys.map(o => `  ${o.item.where}: ${"reason" in o ? o.reason : ""}`)
        ]
      : []),
    ...(unreachable.length > 0
      ? [t("doctor.todoUnreachable"), ...unreachable.map(o => `  ${o.item.label}: ${"reason" in o ? o.reason : ""}`)]
      : []),
    t("doctor.todoRerun")
  ]
}
