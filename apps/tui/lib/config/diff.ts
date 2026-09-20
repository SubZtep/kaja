import { file } from "bun"
import MODELS_TEMPLATE from "../../../../docs/config/models.fireworks.toml" with { type: "text" }
import SECRETS_TEMPLATE from "../../../../docs/config/secrets.toml" with { type: "text" }
import { t } from "../i18n"
import { pathForBundleKey, pickBundleFiles } from "./cli"
import { fetchRemoteConfigBundle } from "./remote-fetch"

async function offlineBundle(): Promise<Record<string, string>> {
  return { "models.toml": MODELS_TEMPLATE }
}

/** Reports what `kaja config fetch` would change: one line per bundle file (unchanged / new / would update), without writing anything. `offline` compares against the bundled templates instead of the server. */
export async function diffConfig(offline: boolean): Promise<string[]> {
  const bundle = offline ? await offlineBundle() : await remoteOrOfflineBundle()
  // secrets.toml is never in the remote bundle (no user secrets on the server) — fetch always
  // compares it against the bundled local template, so diff must too.
  const files: Record<string, string> = { ...bundle, "secrets.toml": SECRETS_TEMPLATE }

  const lines: string[] = []
  for (const key of Object.keys(files).sort((a, b) => a.localeCompare(b))) {
    const path = pathForBundleKey(key)
    const f = file(path)
    if (!(await f.exists())) {
      lines.push(t("config.diffNew", { path }))
      continue
    }
    const existing = await f.text()
    lines.push(existing === files[key] ? t("config.diffUnchanged", { path }) : t("config.diffWouldUpdate", { path }))
  }
  return lines
}

async function remoteOrOfflineBundle(): Promise<Record<string, string>> {
  try {
    // Bypasses the ETag cache: `diff` always wants a full comparison against the current server state.
    const bundle = await fetchRemoteConfigBundle(false)
    return "unchanged" in bundle ? {} : pickBundleFiles(bundle.files)
  } catch {
    return offlineBundle()
  }
}
