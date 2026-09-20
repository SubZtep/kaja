import { file, TOML } from "bun"
import { render } from "ink"
import type { PickerSelection } from "../../components/ability-picker"
import type { WizardProvider, WizardResult, WizardSaved } from "../../components/config-wizard"
import { create, createCloud, isConfigExists, readConfigLoose, savePreferences } from "../config/config"
import type { KajaMode } from "../config/mode"
import type { CredentialItem, OfferedValues } from "../doctor/credentials"
import { t } from "../i18n"
import { getModelsPath, saveProviderBaseUrl, writeModelsTemplate } from "../models/models"
import type { PullProgress } from "../models/pull"

const TEMPLATE_PROVIDERS: WizardProvider[] = ["fireworks", "ollama", "llama"]

async function applyResult(result: WizardResult) {
  const mode: KajaMode = result.mode ?? "local"

  // savePreferences merges into a parsed config, so the file has to exist first. Cloud gets the
  // minimal settings.toml (no stt/tts/memory sections — those are local-agent only).
  if (!(await isConfigExists())) {
    if (mode === "cloud") await createCloud()
    else await create()
  }

  await savePreferences({ mode, ...(result.language ? { locale: result.language } : {}) })
  if (mode === "cloud") return

  // The admin-managed models.toml is no longer offered here; `kaja config fetch` still writes it.
  if (result.provider && TEMPLATE_PROVIDERS.includes(result.provider)) {
    await writeModelsTemplate(result.provider as "fireworks" | "ollama" | "llama")
    if (result.baseUrl) await saveProviderBaseUrl(result.provider, result.baseUrl)
  }
}

/**
 * Turns on the abilities that need no key, after the config files exist. The wizard doesn't ask:
 * there is nothing to weigh up, since none of them can cost anything or reach anything on this
 * machine — `starterSelection` leaves out stdio MCP servers and anything needing a key. Choosing
 * among the rest is what `kaja abilities` is for.
 *
 * A machine with abilities already on is left untouched: its list is the user's own, and silently
 * re-adding what they turned off would be the one thing this can get wrong. Runs before the
 * credential pass so an optional key any of them can use is offered in the same breath.
 */
async function applyStarterAbilities(print: (line: string) => void) {
  const total = (s: PickerSelection) => s.skills.length + s.personas.length + s.tools.length + s.mcp.length

  const { getAbilitiesPath, getMarketplaceDir, loadAbilitiesFile, saveAbilitiesFile } = await import(
    "../abilities/abilities-file"
  )
  if (total(await loadAbilitiesFile()) > 0) return

  const { ensureMarketplace, scanMarketplace, starterSelection } = await import("../abilities/picker")
  await ensureMarketplace(print)
  const selection = starterSelection(await scanMarketplace(getMarketplaceDir()))

  await saveAbilitiesFile(selection)
  print(t("ability.saved", { path: getAbilitiesPath(), count: total(selection) }))
}

/**
 * A value the wizard collected, in the shape the credential pass wants: a key to test and save, or
 * `null` for one the user was offered and turned down, so it isn't asked for all over again.
 * An absent value means the step never applied, and the pass behaves as if the wizard hadn't run.
 */
function offer(where: string, value: string | undefined): OfferedValues {
  return value === undefined ? {} : { [where]: value || null }
}

/**
 * Applies the ticked extras: writes their non-secret config (Speaches' URL, the Telegram account
 * id), and hands their keys back for the credential pass rather than saving any here, so every key
 * is still tested before it's written.
 *
 * `extra` is the items that pass can't discover on its own: `collectCredentials` finds the Telegram
 * token via services.toml's `[telegram]`, but web search has no non-secret config to look for, and
 * a Telegram section we couldn't write leaves its token undiscoverable too.
 */
async function applyExtras(
  result: WizardResult,
  print: (line: string) => void
): Promise<{ extra: CredentialItem[]; offered: OfferedValues }> {
  const extras = result.extras ?? []
  if (extras.length === 0) return { extra: [], offered: {} }

  const { checkTelegramToken, checkWebSearchKey } = await import("../doctor/checks")
  const { saveSecrets } = await import("../config/secrets")
  const { appendTomlSection } = await import("../config/toml")
  const extra: CredentialItem[] = []
  let offered: OfferedValues = {}

  if (extras.includes("voice") && result.voiceUrl) {
    const { getConfigPath, invalidateConfigCache } = await import("../config/config")
    // One answer, two schemes: speech-to-text talks to Speaches' realtime WebSocket API and
    // text-to-speech to its plain HTTP one, which is why the documented example has them differ.
    const schemes = { stt: result.voiceUrl.replace(/^http/, "ws"), tts: result.voiceUrl.replace(/^ws/, "http") }
    for (const [table, url] of Object.entries(schemes)) {
      await appendTomlSection(getConfigPath(), table, [`speachesUrl = ${JSON.stringify(url)}`])
    }
    invalidateConfigCache()
    print(t("wizard.voiceSaved", { url: result.voiceUrl }))
  }

  if (extras.includes("telegram")) {
    const { getServicesPath, invalidateServicesCache, readServicesLoose } = await import("../config/services")
    // allowedUserIds must be non-empty or services.toml fails its schema and every later run exits,
    // so the section is only written once there's a real id to put in it.
    if (result.telegramId && /^\d+$/.test(result.telegramId)) {
      await appendTomlSection(getServicesPath(), "telegram", [`allowedUserIds = [${result.telegramId}]`])
      invalidateServicesCache()
    }
    offered = { ...offered, ...offer("[telegram] botToken", result.telegramToken) }
    if (!(await readServicesLoose()).telegram) {
      // No section for the pass to find, so carry the token itself — it still gets tested and saved.
      print(t("wizard.telegramNeedsId", { path: getServicesPath() }))
      extra.push({
        label: t("doctor.itemTelegram"),
        where: "[telegram] botToken",
        present: false,
        required: true,
        check: value => (value ? checkTelegramToken(value) : Promise.resolve(undefined)),
        save: value => saveSecrets({ telegram: { botToken: value } })
      })
    }
  }

  if (extras.includes("webSearch")) {
    offered = { ...offered, ...offer("[webSearch] apiKey", result.webSearchKey) }
    extra.push({
      label: t("doctor.itemWebSearch"),
      where: "[webSearch] apiKey",
      hint: "header X-Subscription-Token",
      present: false,
      required: true,
      check: value => (value ? checkWebSearchKey(value) : Promise.resolve(undefined)),
      save: value => saveSecrets({ webSearch: { apiKey: value } })
    })
  }

  return { extra, offered }
}

/**
 * One rewritten line while a model downloads, e.g. "  llama3.2:1b: pulling manifest 42%". Only a
 * terminal gets it — a redirected log would collect one line per progress update otherwise.
 */
function progressLine(model: string) {
  let width = 0
  return {
    update({ status, percent }: PullProgress) {
      if (!process.stdout.isTTY) return
      const line = `  ${model}: ${status}${percent === undefined ? "" : ` ${percent}%`}`
      width = Math.max(width, line.length)
      process.stdout.write(`\r${line.padEnd(width)}`)
    },
    // Wipes the progress line so the result prints on a clean one.
    clear() {
      if (process.stdout.isTTY && width > 0) process.stdout.write(`\r${" ".repeat(width)}\r`)
    }
  }
}

/**
 * Offers to download the models the local server hasn't got. One question for the lot rather than
 * one per model: nothing about them is a choice — the config already names them, and either the
 * machine has them or it doesn't. Runs before the credential pass so its probes meet a real model
 * instead of reporting every task as broken. Servers that can't fetch a model ask nothing.
 */
async function offerModelDownloads(print: (line: string) => void) {
  const { loadModels } = await import("../models/models")
  const { missingModels, pullModel } = await import("../models/pull")
  const missing = await missingModels(await loadModels())
  if (missing.length === 0) return

  const { askYesNo } = await import("../doctor/prompt")
  const names = missing.map(target => target.model).join(", ")
  const wanted = await askYesNo(
    t("wizard.pullTitle", { names }),
    t("wizard.pullYes"),
    t("wizard.pullNo"),
    // Without them the local agent can't answer at all, so "yes" is the safe default here.
    { defaultYes: true }
  )
  if (!wanted) {
    print(t("wizard.pullSkipped"))
    return
  }

  print(t("wizard.pullStarted"))
  for (const target of missing) {
    const progress = progressLine(target.model)
    const result = await pullModel(target, progress.update)
    progress.clear()
    print(
      result.ok
        ? t("wizard.pullDone", { model: target.model })
        : t("wizard.pullFailed", { model: target.model, error: result.error })
    )
  }
}

/** The chat model's provider and its base URL from models.toml, for re-offering what the machine already uses. Tolerant: nothing when the file is missing or unparseable. */
async function currentModels(): Promise<{ provider?: WizardProvider; baseUrl?: string }> {
  try {
    const f = file(getModelsPath())
    if (!(await f.exists())) return {}
    const data = TOML.parse(await f.text()) as any
    const provider = TEMPLATE_PROVIDERS.find(name => name === data?.models?.chat?.provider)
    if (!provider) return {}
    const baseUrl = data?.providers?.[provider]?.base_url
    return { provider, baseUrl: typeof baseUrl === "string" ? baseUrl : undefined }
  } catch {
    return {}
  }
}

/** Every step's current value, so a re-run over a working setup opens on what is already there. */
async function readPrefill(): Promise<WizardResult> {
  const config = await readConfigLoose()
  const { provider, baseUrl } = await currentModels()
  const { readServicesLoose } = await import("../config/services")
  const services = await readServicesLoose()

  return {
    mode: config.preferences?.mode,
    language: config.preferences?.locale,
    provider,
    baseUrl,
    // [tts] holds the http:// form, which is what the step offers and what both tables derive from.
    voiceUrl: config.tts?.speachesUrl ?? config.stt?.speachesUrl,
    telegramId: services.telegram?.allowedUserIds?.[0]?.toString()
  }
}

/**
 * Which secrets already exist, for the key steps — the values themselves are never shown or
 * prefilled, so all a step needs is whether pressing Enter would keep something or skip it.
 */
async function readSavedSecrets(): Promise<WizardSaved> {
  const { secrets } = await import("../config/secrets")
  const creds = await secrets()
  return {
    providers: Object.entries(creds.providers)
      .filter(([, value]) => value?.api_key)
      .map(([name]) => name),
    webSearch: Boolean(creds.webSearch?.apiKey),
    telegram: Boolean(creds.telegram?.botToken)
  }
}

/**
 * The setup wizard, for both the first run and `kaja config wizard`. Prefilled from the current config,
 * so Enter at every step keeps what is already set. Non-interactive stdin or `--headless` can't answer a
 * prompt: it writes the bundled templates untouched, no questions, same fallback as before.
 */
export async function runConfigWizard({
  headless,
  mode
}: {
  headless?: boolean
  mode?: KajaMode
} = {}): Promise<{ code: number; text: string }> {
  if (headless || !process.stdin.isTTY) {
    if (!(await isConfigExists())) await create()
    return { code: 0, text: t("wizard.headlessDone") }
  }

  const { ConfigWizard } = await import("../../components/config-wizard")
  const [prefill, saved] = await Promise.all([readPrefill(), readSavedSecrets()])

  const result = await new Promise<WizardResult | undefined>(resolve => {
    const { unmount } = render(
      <ConfigWizard
        prefill={prefill}
        mode={mode}
        saved={saved}
        onDone={r => {
          unmount()
          resolve(r)
        }}
        onCancel={() => {
          unmount()
          resolve(undefined)
        }}
      />
    )
  })

  if (!result) return { code: 0, text: t("wizard.cancelled") }
  await applyResult(result)
  if (result.mode === "cloud") return { code: 0, text: t("wizard.doneCloud") }

  await applyStarterAbilities(line => console.log(line))
  const { extra, offered } = await applyExtras(result, line => console.log(line))
  await offerModelDownloads(line => console.log(line))

  // Reads the config that applyResult, applyStarterAbilities and applyExtras just wrote, then tests
  // every key it needs. The keys the wizard already asked for come in as `offered`, so they are
  // tested and saved without being asked for twice; it still asks for anything only the finished
  // config reveals — an ability's key, an MCP server's declared secret.
  const { isUnresolved, runCredentialPass } = await import("../doctor/credentials")
  const providerKey = result.provider ? offer(`[providers.${result.provider}] api_key`, result.providerKey) : {}
  const outcomes = await runCredentialPass(line => console.log(line), t("wizard.checking"), extra, {
    ...providerKey,
    ...offered
  })
  const unresolved = outcomes.filter(isUnresolved).length
  return { code: 0, text: unresolved > 0 ? t("wizard.doneWithIssues", { count: unresolved }) : t("wizard.done") }
}
