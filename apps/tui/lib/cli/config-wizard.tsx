import { file, TOML } from "bun"
import { render } from "ink"
import type { PickerSelection } from "../../components/ability-picker"
import type { WizardResult, WizardSaved } from "../../components/config-wizard"
import { create, createCloud, isConfigExists, readConfigLoose, savePreferences } from "../config/config"
import type { KajaMode } from "../config/mode"
import type { CredentialItem, OfferedValues } from "../doctor/credentials"
import { statusLine } from "../doctor/status"
import { t } from "../i18n"
import { CATALOG, candidatesByTask, catalogProvider } from "../models/catalog"
import { getModelsPath, writeModelsFromCatalog } from "../models/models"
import type { PullProgress } from "../models/pull"

/**
 * Points speech in and out at one Speaches server. It talks to that server's realtime WebSocket API
 * for speech-to-text and its plain HTTP one for text-to-speech, so one address is written in both
 * forms. Sets the value even when the table exists, so an address changed on a re-run takes effect.
 */
async function applySpeachesUrl(url: string, print: (line: string) => void) {
  const { getConfigPath, invalidateConfigCache } = await import("../config/config")
  const { setTomlValue } = await import("../config/toml")
  const schemes = { stt: url.replace(/^http/, "ws"), tts: url.replace(/^ws/, "http") }
  for (const [table, value] of Object.entries(schemes)) {
    await setTomlValue(getConfigPath(), table, "speachesUrl", JSON.stringify(value))
  }
  invalidateConfigCache()
  print(statusLine("success", t("wizard.voiceSaved", { url })))
}

async function applyResult(result: WizardResult, print: (line: string) => void) {
  const mode: KajaMode = result.mode ?? "local"

  // savePreferences merges into a parsed config, so the file has to exist first. Cloud gets the
  // minimal settings.toml (no stt/tts/memory sections — those are local-agent only).
  if (!(await isConfigExists())) {
    if (mode === "cloud") await createCloud()
    else await create()
  }

  await savePreferences({
    mode,
    ...(result.language ? { locale: result.language } : {}),
    ...(result.theme ? { theme: result.theme } : {})
  })
  if (mode === "cloud") {
    if (result.language) {
      const { saveAccountLocale } = await import("../auth/account-locale")
      await saveAccountLocale(result.language)
    }
    return
  }

  // Nothing ticked: models.toml is the user's to write, so it is left exactly as it is.
  const { chosenProviders } = await import("../../components/config-wizard")
  const providers = chosenProviders(result)
  if (providers.length === 0) return

  await writeModelsFromCatalog({ providers, pick: result.models, baseUrls: result.addresses })
  // Speaches is the one provider that also lives in settings.toml: its address is where voice goes.
  const speaches = providers.find(provider => provider.id === "speaches")
  if (speaches) await applySpeachesUrl(result.addresses?.speaches ?? speaches.baseUrl, print)
}

/**
 * Turns on the abilities that need no key, after the config files exist. The wizard doesn't ask:
 * there is nothing to weigh up, since none of them can cost anything or reach anything on this
 * machine — `starterSelection` leaves out stdio MCP servers and anything needing a key. Choosing
 * among the rest is what `kaja abilities` is for.
 *
 * A machine with abilities already on is left untouched: its list is the user's own, and silently
 * re-adding what they turned off would be the one thing this can get wrong. Optional keys some of
 * them can use are not asked for: nothing needs them, and `kaja abilities` offers them.
 */
export async function applyStarterAbilities(print: (line: string) => void) {
  const total = (s: PickerSelection) => s.skills.length + s.personas.length + s.tools.length + s.mcp.length

  const { getAbilitiesPath, getMarketplaceDir, loadAbilitiesFile, marketplaceSettings, saveAbilitiesFile } =
    await import("../abilities/abilities-file")
  if (!(await marketplaceSettings()).enabled || total(await loadAbilitiesFile()) > 0) return

  const { ensureMarketplace, scanMarketplace, starterSelection } = await import("../abilities/picker")
  await ensureMarketplace(print)
  const selection = starterSelection(await scanMarketplace(getMarketplaceDir()))

  await saveAbilitiesFile(selection)
  print(statusLine("success", t("ability.saved", { path: getAbilitiesPath(), count: total(selection) })))
}

async function saveMarketplaceSetting(key: "enabled" | "autoFetch", value: boolean) {
  const { getConfigPath, invalidateConfigCache } = await import("../config/config")
  const { setTomlValue } = await import("../config/toml")
  await setTomlValue(getConfigPath(), "marketplace", key, String(value))
  invalidateConfigCache()
}

/**
 * Asks whether to use the online marketplace and records it in settings.toml's `[marketplace]`. "No" means
 * Kaja never goes online for abilities. "Yes" checks git (the one thing the fetch needs), fetches once, and only
 * then asks about fetching periodically, so the question comes with something the user has seen work. A git that
 * can't fetch leaves the marketplace off rather than on and failing at every start.
 */
export async function offerMarketplace(print: (line: string) => void) {
  const { marketplaceSettings } = await import("../abilities/abilities-file")
  const { askYesNo } = await import("../doctor/prompt")
  const current = await marketplaceSettings()

  const wanted = await askYesNo(t("wizard.marketplaceTitle"), t("wizard.marketplaceYes"), t("wizard.marketplaceNo"), {
    defaultYes: current.enabled,
    yesFirst: true
  })
  if (!wanted) {
    await saveMarketplaceSetting("enabled", false)
    print(statusLine("info", t("wizard.marketplaceOff")))
    return
  }

  const { checkGit } = await import("../abilities/fetch")
  const git = await checkGit()
  if (!git.ok) {
    await saveMarketplaceSetting("enabled", false)
    print(statusLine("warning", t("wizard.marketplaceNoGit", { reason: git.reason })))
    return
  }
  await saveMarketplaceSetting("enabled", true)

  const { ensureMarketplace } = await import("../abilities/picker")
  await ensureMarketplace(print)

  const auto = await askYesNo(t("wizard.autoFetchTitle"), t("wizard.autoFetchYes"), t("wizard.autoFetchNo"), {
    defaultYes: current.autoFetch,
    yesFirst: true
  })
  await saveMarketplaceSetting("autoFetch", auto)
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
 * Applies the ticked extras: hands their keys back for the credential pass rather than saving any here, so every key is still tested before
 * it's written.
 *
 * `extra` is the items that pass can't discover on its own: a token or key that isn't saved yet
 * leaves nothing in the config to look for.
 */
async function applyExtras(result: WizardResult): Promise<{ extra: CredentialItem[]; offered: OfferedValues }> {
  const extras = result.extras ?? []
  if (extras.length === 0) return { extra: [], offered: {} }

  const { checkTelegramToken } = await import("../doctor/checks")
  const { saveSecrets } = await import("../config/secrets")
  const extra: CredentialItem[] = []
  let offered: OfferedValues = {}

  if (extras.includes("telegram")) {
    offered = { ...offered, ...offer("[telegram] bot_token", result.telegramToken) }
    extra.push({
      label: t("doctor.itemTelegram"),
      where: "[telegram] bot_token",
      present: false,
      required: true,
      check: value => (value ? checkTelegramToken(value) : Promise.resolve(undefined)),
      save: value => saveSecrets({ telegram: { bot_token: value } })
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
      const suffix = percent === undefined ? "" : ` ${percent}%`
      const line = `  ${model}: ${status}${suffix}`
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
    print(statusLine("info", t("wizard.pullSkipped")))
    return
  }

  print(statusLine("info", t("wizard.pullStarted")))
  for (const target of missing) {
    const progress = progressLine(target.model)
    const result = await pullModel(target, progress.update)
    progress.clear()
    print(
      result.ok
        ? statusLine("success", t("wizard.pullDone", { model: target.model }))
        : statusLine("error", t("wizard.pullFailed", { model: target.model, error: result.error }))
    )
  }
}

/**
 * The providers models.toml already uses, where each local one listens, and which provider serves
 * each task more than one could — for re-offering what the machine already runs. Tolerant: nothing
 * when the file is missing or unparseable.
 */
async function currentModels(): Promise<Pick<WizardResult, "providers" | "addresses" | "models" | "custom">> {
  try {
    const f = file(getModelsPath())
    if (!(await f.exists())) return {}
    const data = TOML.parse(await f.text()) as any
    const known = CATALOG.filter(provider => data?.providers?.[provider.id])

    const addresses: Record<string, string> = {}
    for (const provider of known) {
      const url = data.providers[provider.id].base_url
      if (provider.kind === "self-hosted" && typeof url === "string") addresses[provider.id] = url
    }

    // A provider the catalog doesn't know is the user's own; the wizard can carry one, so a re-run keeps it.
    const customName = Object.keys(data?.providers ?? {}).find(name => !catalogProvider(name))
    const custom: NonNullable<WizardResult["custom"]> | undefined = customName
      ? {
          name: customName,
          baseUrl: data.providers[customName].base_url,
          models: Object.values<any>(data.models ?? {})
            .filter(entry => entry.provider === customName)
            .map(entry => ({ model: entry.model, task: entry.task }))
        }
      : undefined

    const providers = [...known.map(provider => provider.id), ...(custom ? ["custom"] : [])]
    if (providers.length === 0) return {}

    // Which provider serves each task more than one could, judged over everything the file holds.
    const { chosenProviders } = await import("../../components/config-wizard")
    const models: NonNullable<WizardResult["models"]> = {}
    for (const [task, options] of Object.entries(candidatesByTask(chosenProviders({ providers, custom })))) {
      const active = data?.models?.[task]?.provider
      if (options.length > 1 && typeof active === "string") models[task as keyof typeof models] = active
    }
    return { providers, addresses, models, ...(custom ? { custom } : {}) }
  } catch {
    return {}
  }
}

/** Every step's current value, so a re-run over a working setup opens on what is already there. */
async function readPrefill(): Promise<WizardResult> {
  const config = await readConfigLoose()
  const { resolveTheme } = await import("../terminal-background")

  return {
    mode: config.preferences?.mode,
    language: config.preferences?.locale,
    // A saved dark/light as is; otherwise the terminal is asked, which reads stdin, so this has to finish before the wizard renders
    theme: await resolveTheme(config.preferences?.theme),
    ...(await currentModels())
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
    telegram: Boolean(creds.telegram?.bot_token)
  }
}

/**
 * Tests the models the wizard just wrote, the same pass `kaja doctor` runs, so a broken one is found
 * now, while its alternative is one keypress away. Nothing was tested while the questions were being
 * answered: that kept them quick. Returns how many tasks are still without a working model.
 */
async function checkModels(): Promise<number> {
  const { loadModels } = await import("../models/models")
  const models = await loadModels()
  if (models.length === 0) return 0

  const { defaultModelIo, runModelPass } = await import("../doctor/models")
  console.log(t("wizard.checkingModels"))
  const outcomes = await runModelPass(models, line => console.log(line), await defaultModelIo())
  console.log()
  return outcomes.filter(outcome => !outcome.ok).length
}

/**
 * The setup wizard, for both the first run and `kaja config wizard`. Prefilled from the current config,
 * so Enter at every step keeps what is already set. Non-interactive stdin or `--headless` can't answer a
 * prompt: it writes the bundled templates untouched, no questions, same fallback as before.
 */
export async function runConfigWizard({
  headless,
  mode,
  firstRun
}: {
  headless?: boolean
  mode?: KajaMode
  /** A plain `kaja` with no config yet, which starts the chat once the wizard is done. */
  firstRun?: boolean
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
        firstRun={firstRun}
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
  // The prompts and progress bars after the wizard follow the theme just picked
  if (result.theme) {
    const { setConsoleTheme } = await import("../terminal-background")
    setConsoleTheme(result.theme)
  }
  await applyResult(result, line => console.log(line))
  if (result.mode === "cloud") return { code: 0, text: t("wizard.doneCloud") }

  await offerMarketplace(line => console.log(line))
  await applyStarterAbilities(line => console.log(line))
  const { extra, offered } = await applyExtras(result)
  await offerModelDownloads(line => console.log(line))

  // Reads the config that applyResult, applyStarterAbilities and applyExtras just wrote, then tests
  // every key it needs. The keys the wizard already asked for come in as `offered`, so they are
  // tested and saved without being asked for twice; it still asks for anything only the finished
  // config reveals — an ability's key, an MCP server's declared secret.
  const { isUnresolved, runCredentialPass } = await import("../doctor/credentials")
  const providerKeys: OfferedValues = {}
  for (const [id, key] of Object.entries(result.keys ?? {})) {
    Object.assign(providerKeys, offer(`[providers.${id}] api_key`, key))
  }
  const outcomes = await runCredentialPass(line => console.log(line), t("wizard.checking"), extra, {
    ...providerKeys,
    ...offered
  })
  const failingModels = await checkModels()
  const unresolved = outcomes.filter(isUnresolved).length + failingModels
  return { code: 0, text: unresolved > 0 ? t("wizard.doneWithIssues", { count: unresolved }) : t("wizard.done") }
}
