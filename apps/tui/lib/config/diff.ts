import { file } from "bun"
import MCP_TEMPLATE from "../../../../docs/config/mcp.toml" with { type: "text" }
import MODELS_TEMPLATE from "../../../../docs/config/models.fireworks.toml" with { type: "text" }
import { t } from "../i18n"
import { TEMPLATES as PERSONA_TEMPLATES } from "../personas/personas"
import { pathForBundleKey } from "./cli"
import { fetchRemoteConfigBundle } from "./remote-fetch"

async function offlineBundle(): Promise<Record<string, string>> {
  const files: Record<string, string> = { "models.toml": MODELS_TEMPLATE, "mcp.toml": MCP_TEMPLATE }
  for (const [id, text] of Object.entries(PERSONA_TEMPLATES)) {
    files[`personas/${id}.toml`] = text
  }
  return files
}

/** Reports what `kaja config fetch` would change: one line per bundle file (unchanged / new / would update), without writing anything. `offline` compares against the bundled templates instead of the server. */
export async function diffConfig(offline: boolean): Promise<string[]> {
  const files = offline ? await offlineBundle() : await remoteOrOfflineBundle()

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
    return "unchanged" in bundle ? {} : bundle.files
  } catch {
    return offlineBundle()
  }
}
