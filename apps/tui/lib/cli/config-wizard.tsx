import { render } from "ink"
import type { WizardResult } from "../../components/config-wizard"
import { pathForBundleKey } from "../config/cli"
import { create, isConfigExists, readConfigLoose, savePreferences } from "../config/config"
import { writeTemplateConfig } from "../config/fetch"
import { fetchRemoteConfigBundle } from "../config/remote-fetch"
import { saveSecrets } from "../config/secrets"
import { t } from "../i18n"
import { writeModelsTemplate } from "../models/models"
import { loadPersonas } from "../personas/personas"

async function applyResult(result: WizardResult) {
  if (!(await isConfigExists())) await create()

  if (result.language || result.persona) {
    await savePreferences({
      ...(result.language ? { language: result.language } : {}),
      ...(result.persona ? { persona: result.persona } : {})
    })
  }

  if (result.provider === "fetch") {
    // Writes the whole bundle (models.toml, mcp.toml and every persona), matching what
    // `kaja config fetch` does — picking "fetch" here means "take the admin-managed defaults".
    const bundle = await fetchRemoteConfigBundle(false)
    if (!("unchanged" in bundle)) {
      await Promise.all(
        Object.entries(bundle.files).map(([key, text]) => writeTemplateConfig(text, pathForBundleKey(key)))
      )
    }
  } else if (result.provider) {
    await writeModelsTemplate(result.provider)
  }

  if (result.provider === "fireworks" && result.apiKey) {
    await saveSecrets({ providers: { fireworks: { api_key: result.apiKey } } })
  }
}

/** `kaja config wizard` — re-runnable multi-step setup, prefilled from the current config. Non-interactive stdin or `--headless`: writes bundled templates untouched, no prompts (same fallback as first-run). */
export async function runConfigWizard(headless: boolean): Promise<{ code: number; text: string }> {
  if (headless || !process.stdin.isTTY) {
    if (!(await isConfigExists())) await create()
    return { code: 0, text: t("wizard.headlessDone") }
  }

  const { ConfigWizard } = await import("../../components/config-wizard")
  const [existingConfig, personas] = await Promise.all([readConfigLoose(), loadPersonas()])

  const prefill: WizardResult = {
    language: existingConfig.preferences?.language,
    persona: existingConfig.preferences?.persona
  }

  const result = await new Promise<WizardResult | undefined>(resolve => {
    const { unmount } = render(
      <ConfigWizard
        personaChoices={personas.map(p => ({ id: p.id, label: p.label }))}
        prefill={prefill}
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
  return { code: 0, text: t("wizard.done") }
}
