import { type ModelTask, providerKey } from "@kaja/schema/config"
import { render } from "ink"
import type { ProbeTarget, WizardResult, WizardSaved } from "../../components/config-wizard"
import type { LiveCheck } from "../../components/secret-prompt"
import { create, isConfigExists, readConfigLoose, savePreferences } from "../config/config"
import type { KajaMode } from "../config/mode"
import type { CredentialItem, OfferedValues } from "../doctor/credentials"
import { statusLine } from "../doctor/status"
import { t } from "../i18n"
import { type CatalogProvider, catalogProvider } from "../models/catalog"
import { readCurrentModels } from "../models/current"
import { detectedProvider, type DetectedServer, detectLocalServers, sameAddress } from "../models/detect"
import { writeModelsFromCatalog } from "../models/models"
import { refreshCatalog } from "../models/modelsdev"
import type { PullProgress } from "../models/pull"

/**
 * Points speech in and out at one Speaches server. It talks to that server's realtime WebSocket API for speech-to-text
 * and its plain HTTP one for text-to-speech, so one address is written in both forms. Sets the value even when the
 * table exists, so an address changed on a re-run takes effect.
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

  // savePreferences merges into a parsed config, so the file has to exist first
  if (!(await isConfigExists())) await create()

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
  const { chosenPicks, chosenProviders } = await import("../../components/config-wizard")
  const providers = chosenProviders(result)
  if (providers.length === 0) return

  await writeModelsFromCatalog({ providers, picks: chosenPicks(result), baseUrls: result.addresses })
  // A key read from the environment is saved as the variable's name now; the credential pass then tests what it holds
  const keyEnv = Object.entries(result.keyEnv ?? {})
  if (keyEnv.length > 0) {
    const { saveSecrets } = await import("../config/secrets")
    await saveSecrets({
      providers: Object.fromEntries(keyEnv.map(([id, name]) => [id, { api_key_env: name }]))
    })
  }
  // Speaches is the one provider that also lives in settings.toml: its address is where voice goes.
  const speaches = providers.find(provider => provider.id === "speaches")
  if (speaches) await applySpeachesUrl(result.addresses?.speaches ?? speaches.baseUrl, print)
}

async function saveMarketplaceSetting(key: "enabled" | "autoFetch", value: boolean) {
  const { getConfigPath, invalidateConfigCache } = await import("../config/config")
  const { setTomlValue } = await import("../config/toml")
  await setTomlValue(getConfigPath(), "marketplace", key, String(value))
  invalidateConfigCache()
}

type GitCheck = Awaited<ReturnType<typeof import("../abilities/fetch").checkGit>>

/**
 * Records the wizard's marketplace answers in settings.toml's `[marketplace]` and fetches it once. "No" means Kaja
 * never goes online for abilities. A git that can't fetch leaves the marketplace off rather than on and failing at
 * every start.
 */
async function applyMarketplace(result: WizardResult, git: GitCheck, print: (line: string) => void) {
  if (!git.ok) {
    await saveMarketplaceSetting("enabled", false)
    print(statusLine("warning", t("wizard.marketplaceNoGit", { reason: git.reason })))
    return
  }
  if (result.marketplace === false) {
    await saveMarketplaceSetting("enabled", false)
    print(statusLine("info", t("wizard.marketplaceOff")))
    return
  }
  await saveMarketplaceSetting("enabled", true)
  await saveMarketplaceSetting("autoFetch", result.autoFetch !== false)

  const { ensureMarketplace } = await import("../abilities/cli")
  await ensureMarketplace(print)
}

/**
 * A value the wizard collected, in the shape the credential pass wants: a key to test and save, or `null` for one the
 * user was offered and turned down, so it isn't asked for all over again. An absent value means the step never applied,
 * and the pass behaves as if the wizard hadn't run.
 */
function offer(where: string, value: string | undefined): OfferedValues {
  return value === undefined ? {} : { [where]: value || null }
}

/**
 * The ticked extras' keys, handed to the credential pass rather than saved here, so each is still tested before it's
 * written. `extra` is the items that pass can't discover on its own: a token that isn't saved yet leaves nothing in the
 * config to look for.
 */
async function applyExtras(result: WizardResult): Promise<{ extra: CredentialItem[]; offered: OfferedValues }> {
  if (!result.extras?.includes("telegram")) return { extra: [], offered: {} }
  const { telegramItem } = await import("../doctor/credentials")
  const item = telegramItem()
  return { extra: [item], offered: offer(item.where, result.telegramToken) }
}

/**
 * One rewritten line while a model downloads, e.g. " llama3.2:1b: pulling manifest 42%". Only a terminal gets it — a
 * redirected log would collect one line per progress update otherwise.
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
 * Offers to download the models the local server hasn't got. One question for the lot rather than one per model:
 * nothing about them is a choice — the config already names them, and either the machine has them or it doesn't. Runs
 * before the credential pass so its probes meet a real model instead of reporting every task as broken. Servers that
 * can't fetch a model ask nothing.
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
    const result = await pullModel(target, status => progress.update(status))
    progress.clear()
    print(
      result.ok
        ? statusLine("success", t("wizard.pullDone", { model: target.model }))
        : statusLine("error", t("wizard.pullFailed", { model: target.model, error: result.error }))
    )
  }
}

/**
 * The providers models.toml already uses, where each local one listens, and the model in use for each task, for
 * re-offering what the machine already runs. The first provider the catalog doesn't know becomes the
 * custom one the wizard asks about; any others are kept as they are. Nothing when the file is missing or unparseable.
 */
async function currentModels(
  servers: DetectedServer[]
): Promise<Pick<WizardResult, "providers" | "addresses" | "tasks" | "models" | "custom" | "keep" | "local">> {
  const local = localProviders(servers)
  const current = await readCurrentModels()
  if (!current) return local.length > 0 ? { local } : {}
  // A provider models.toml already has at a running server's address is that server, under the name it has there
  const running: string[] = []
  const own = current.own.filter(provider => {
    const server = local.find(candidate => sameAddress(candidate.baseUrl, provider.baseUrl))
    if (!server) return true
    server.id = provider.id
    running.push(provider.id)
    return false
  })
  const [first, ...rest] = own
  const custom = first && {
    name: first.id,
    baseUrl: first.baseUrl,
    models: first.models.flatMap(({ model, tasks }) => tasks.map(task => ({ model, task }))),
    // Reviewed in one list rather than asked model by model
    saved: true,
    done: true
  }
  const providers = [...current.providers, ...running, ...(custom ? ["custom"] : [])]
  if (providers.length === 0) return local.length > 0 ? { local } : {}
  return {
    providers,
    ...(local.length > 0 ? { local } : {}),
    addresses: current.addresses,
    tasks: Object.keys(current.picks) as ModelTask[],
    models: current.picks,
    ...(custom ? { custom } : {}),
    ...(rest.length > 0 ? { keep: rest } : {})
  }
}

/**
 * The servers found running as providers the wizard offers, each under an id no catalog provider or other server has
 * (models.dev lists LM Studio too; the running one's own models win).
 */
function localProviders(servers: DetectedServer[]): CatalogProvider[] {
  const taken = new Set<string>()
  return servers.map(server => {
    const provider = detectedProvider(server)
    let id = catalogProvider(provider.id) ? `${provider.id}-local` : provider.id
    for (let n = 2; taken.has(id); n++) id = `${provider.id}-${n}`
    taken.add(id)
    return { ...provider, id }
  })
}

/** Every step's current value, so a re-run over a working setup opens on what is already there. */
async function readPrefill(servers: DetectedServer[]): Promise<WizardResult> {
  const config = await readConfigLoose()
  const { resolveTheme } = await import("../terminal-background")

  return {
    mode: config.preferences?.mode,
    language: config.preferences?.locale,
    // A saved dark/light as is; otherwise the terminal is asked, which reads stdin, so this has to finish before the wizard renders
    theme: await resolveTheme(config.preferences?.theme),
    ...(await currentModels(servers))
  }
}

/**
 * Which secrets already exist, for the key steps — the values themselves are never shown or prefilled, so all a step
 * needs is whether pressing Enter would keep something or skip it.
 */
async function readSavedSecrets(): Promise<WizardSaved> {
  const { secrets } = await import("../config/secrets")
  const creds = await secrets()
  // A key read from an environment variable isn't saved, so it has no tail to show
  const tail = (key: string | undefined) => (key && key.length >= 12 ? key.slice(-4) : undefined)
  const tails = Object.fromEntries(
    [
      ...Object.entries(creds.providers).map(([name, value]) => [
        name,
        value && "api_key" in value ? tail(value.api_key) : undefined
      ]),
      ["telegram", tail(creds.telegram?.bot_token)]
    ].filter(([, value]) => value !== undefined)
  )
  return {
    providers: Object.entries(creds.providers)
      .filter(([, value]) => Boolean(value))
      .map(([name]) => name),
    telegram: Boolean(creds.telegram?.bot_token),
    tails
  }
}

/** The wizard's live test of a typed answer: a key or address against `GET /models`, a bot token against Telegram. */
async function probeAnswer(target: ProbeTarget, signal: AbortSignal): Promise<LiveCheck | undefined> {
  if (target.kind === "telegram") {
    const { checkTelegramToken } = await import("../doctor/checks")
    const result = await checkTelegramToken(target.token)
    return result.ok
      ? { tone: "ok", note: t("wizard.checkTelegramOk") }
      : { tone: "bad", note: t("wizard.checkTelegramBad"), detail: result.reason }
  }
  const { probeModels } = await import("../models/list")
  const key = target.kind === "key" ? target.key : undefined
  const probe = await probeModels(target.baseUrl, key, { signal })
  if (probe.ok) {
    const count = probe.ids.length
    return { tone: "ok", note: t(key ? "wizard.checkKeyOk" : "wizard.checkServerOk", { count }) }
  }
  const refused = probe.status === 401 || probe.status === 403
  if (key) {
    // Only a refusal is about the key; anything else means it couldn't be judged
    return refused
      ? { tone: "bad", note: t("wizard.checkKeyRejected"), detail: probe.error }
      : {
          tone: "warn",
          note: t("wizard.checkKeyUnknown"),
          detail: t("wizard.checkKeyUnknownDetail", { error: probe.error })
        }
  }
  if (refused) return { tone: "ok", note: t("wizard.checkServerNeedsKey") }
  return {
    tone: "warn",
    note: t("wizard.checkServerDown"),
    detail: t("wizard.checkServerDownDetail", { error: probe.error })
  }
}

/** The custom provider's model ids, asked with the key just typed, else the one already saved for it. */
async function listProviderModels(baseUrl: string, provider: string, key?: string): Promise<string[]> {
  const { listModelIds } = await import("../models/list")
  const { secrets } = await import("../config/secrets")
  const apiKey = key ?? providerKey((await secrets()).providers[provider])
  return listModelIds(baseUrl, apiKey)
}

/**
 * Tests the models the wizard just wrote, the same pass `kaja doctor` runs, so a broken one is found now, while its
 * alternative is one keypress away. Nothing was tested while the questions were being answered: that kept them quick.
 * Returns how many tasks are still without a working model.
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
 * The setup wizard, for both the first run and `kaja config wizard`. Prefilled from the current config, so Enter at
 * every step keeps what is already set. Without a provider catalog (offline) it asks for every detail of the user's own
 * provider instead. Non-interactive stdin or `--headless` can't answer a prompt: it writes a minimal settings.toml, no
 * questions.
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

  const { ConfigWizard, chosenHooks } = await import("../../components/config-wizard")
  const { applyHooks, hooksPrefill } = await import("../hooks/offer")
  const hooks = hooksPrefill()
  const { marketplaceSettings } = await import("../abilities/abilities-file")
  const { enabled, autoFetch } = await marketplaceSettings()
  // Turned off, it has no auto-update setting to keep; turning it on starts with auto-update on
  const marketplace = { marketplace: enabled, autoFetch: enabled ? autoFetch : true }
  // Before the prefill, which matches models.toml's providers against the catalog and the servers running here
  const { checkGit } = await import("../abilities/fetch")
  const [hasCatalog, servers, git] = await Promise.all([refreshCatalog(), detectLocalServers(), checkGit()])
  if (!hasCatalog) console.log(statusLine("info", t("wizard.noCatalog")))
  const [prefill, saved] = await Promise.all([readPrefill(servers), readSavedSecrets()])

  const result = await new Promise<WizardResult | undefined>(resolve => {
    const { unmount } = render(
      <ConfigWizard
        prefill={{ ...prefill, ...(hooks.current ? { hooks: hooks.current } : {}), ...marketplace }}
        hookPrograms={hooks.programs}
        gitReady={git.ok}
        mode={mode}
        saved={saved}
        listModels={listProviderModels}
        probe={probeAnswer}
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
  // Cloud chat has the same hooks, so this comes before the mode split
  await applyHooks(chosenHooks(result, hooks.programs), line => console.log(line))
  if (result.mode === "cloud") return { code: 0, text: t("wizard.doneCloud") }

  await applyMarketplace(result, git, line => console.log(line))
  // Right after the sync: abilities a persona uses that can't start here get install / sandbox / skip.
  const { offerAbilityHosts } = await import("../abilities/hosts")
  await offerAbilityHosts(line => console.log(line))
  const { extra, offered } = await applyExtras(result)
  await offerModelDownloads(line => console.log(line))

  // Reads the config that applyResult just wrote, then tests every key it needs. The keys the wizard already asked
  // for come in as `offered`, so they're tested and saved without being asked twice; it still asks for what only the
  // finished config reveals: the keys of the abilities some persona uses.
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
