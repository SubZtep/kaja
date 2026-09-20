import { file, TOML } from "bun"
import { render } from "ink"
import type { PickerSelection } from "../../components/ability-picker"
import type { WizardAbilities, WizardExtra, WizardProvider, WizardResult } from "../../components/config-wizard"
import { pathForBundleKey } from "../config/cli"
import { create, createCloud, isConfigExists, readConfigLoose, savePreferences } from "../config/config"
import { writeTemplateConfig } from "../config/fetch"
import type { KajaMode } from "../config/mode"
import { fetchRemoteConfigBundle } from "../config/remote-fetch"
import type { CredentialItem } from "../doctor/credentials"
import { t } from "../i18n"
import { getModelsPath, saveProviderBaseUrl, writeModelsTemplate } from "../models/models"

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

  if (result.provider === "fetch") {
    // Same bundle `kaja config fetch` writes (models.toml) — picking "fetch" means "take the
    // admin-managed defaults". Personas and MCP servers come from `kaja abilities update` instead.
    const bundle = await fetchRemoteConfigBundle(false)
    if (!("unchanged" in bundle)) {
      await Promise.all(
        Object.entries(bundle.files).map(([key, text]) => writeTemplateConfig(text, pathForBundleKey(key)))
      )
    }
  } else if (result.provider && TEMPLATE_PROVIDERS.includes(result.provider)) {
    await writeModelsTemplate(result.provider as "fireworks" | "ollama" | "llama")
    if (result.baseUrl) await saveProviderBaseUrl(result.provider, result.baseUrl)
  }
}

/**
 * Applies the abilities choice, after the config files exist. "starter" adds the keyless set to
 * whatever is already on, never removing the user's own picks; "pick" opens the same checklist
 * `kaja abilities` uses, and cancelling it leaves abilities.toml alone. Runs before the credential
 * pass so any key the newly enabled abilities need is asked for in the same breath.
 */
async function applyAbilities(choice: WizardAbilities, print: (line: string) => void) {
  if (choice === "none") return

  const { getAbilitiesPath, getMarketplaceDir, loadAbilitiesFile, saveAbilitiesFile } = await import(
    "../abilities/abilities-file"
  )
  const {
    allItems,
    confirmStdioServers,
    ensureMarketplace,
    mergeSelection,
    pickAbilities,
    scanMarketplace,
    starterSelection
  } = await import("../abilities/picker")

  await ensureMarketplace(print)
  const scan = await scanMarketplace(getMarketplaceDir())
  const enabled = await loadAbilitiesFile()

  let selection: PickerSelection
  if (choice === "starter") {
    selection = mergeSelection(enabled, starterSelection(scan))
  } else {
    const picked = await pickAbilities(allItems(scan), enabled)
    if (!picked) return
    // Only the checklist can reach a stdio server; the starter set never contains one.
    selection = { ...picked, mcp: await confirmStdioServers(picked.mcp, scan.mcpScan, enabled.mcp) }
  }

  await saveAbilitiesFile(selection)
  const count = selection.skills.length + selection.personas.length + selection.tools.length + selection.mcp.length
  print(t("ability.saved", { path: getAbilitiesPath(), count }))
}

/** Speaches serves both speech-to-text and text-to-speech, so one URL configures voice in and out. */
const DEFAULT_SPEACHES_URL = "http://localhost:8000"

/**
 * Applies the ticked extras. Each writes only its non-secret config here; the credentials come from
 * the credential pass that runs next, so they are tested before being saved like every other key.
 *
 * Returns the items that pass can't discover on its own: `collectCredentials` finds the Telegram
 * token via services.toml's `[telegram]`, but web search has no non-secret config to look for, and
 * a Telegram section we couldn't write leaves its token undiscoverable too.
 */
async function applyExtras(extras: WizardExtra[], print: (line: string) => void): Promise<CredentialItem[]> {
  if (extras.length === 0) return []

  const { askText } = await import("../doctor/prompt")
  const { checkTelegramToken, checkWebSearchKey } = await import("../doctor/checks")
  const { saveSecrets } = await import("../config/secrets")
  const { appendTomlSection } = await import("../config/toml")
  const extra: CredentialItem[] = []

  if (extras.includes("voice")) {
    const url = await askText(t("wizard.voiceUrlTitle"), {
      hint: t("wizard.voiceUrlHint"),
      defaultValue: DEFAULT_SPEACHES_URL
    })
    if (url) {
      const { getConfigPath, invalidateConfigCache } = await import("../config/config")
      for (const table of ["stt", "tts"]) {
        await appendTomlSection(getConfigPath(), table, [`speachesUrl = ${JSON.stringify(url)}`])
      }
      invalidateConfigCache()
      print(t("wizard.voiceSaved", { url }))
    }
  }

  if (extras.includes("telegram")) {
    const { getServicesPath, invalidateServicesCache, readServicesLoose } = await import("../config/services")
    // allowedUserIds must be non-empty or services.toml fails its schema and every later run exits,
    // so the section is only written once there's a real id to put in it.
    const id = await askText(t("wizard.telegramIdTitle"), { hint: t("wizard.telegramIdHint") })
    if (id && /^\d+$/.test(id)) {
      await appendTomlSection(getServicesPath(), "telegram", [`allowedUserIds = [${id}]`])
      invalidateServicesCache()
    }
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

  return extra
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
  const { loadAbilitiesFile } = await import("../abilities/abilities-file")
  const enabled = await loadAbilitiesFile()
  const hasAbilities = enabled.skills.length + enabled.personas.length + enabled.tools.length + enabled.mcp.length > 0

  return {
    mode: config.preferences?.mode,
    language: config.preferences?.locale,
    provider,
    baseUrl,
    // Someone who has already curated their abilities shouldn't have the starter set added by
    // holding Enter; a machine with none gets offered it.
    abilities: hasAbilities ? "none" : "starter"
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
  const prefill = await readPrefill()

  const result = await new Promise<WizardResult | undefined>(resolve => {
    const { unmount } = render(
      <ConfigWizard
        prefill={prefill}
        mode={mode}
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

  if (result.abilities) await applyAbilities(result.abilities, line => console.log(line))
  const extra = await applyExtras(result.extras ?? [], line => console.log(line))

  // Reads the config that applyResult, applyAbilities and applyExtras just wrote, then asks for and
  // tests every key it needs — the provider's included, which is why no step above collects one.
  const { isUnresolved, runCredentialPass } = await import("../doctor/credentials")
  const outcomes = await runCredentialPass(line => console.log(line), t("wizard.checking"), extra)
  const unresolved = outcomes.filter(isUnresolved).length
  return { code: 0, text: unresolved > 0 ? t("wizard.doneWithIssues", { count: unresolved }) : t("wizard.done") }
}
