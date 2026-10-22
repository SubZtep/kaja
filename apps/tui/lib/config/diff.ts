import { CommandsFileSchema } from "@kaja/schema/config"
import { deepEquals, file, TOML } from "bun"
import COMMANDS_TEMPLATE from "../../../../config/commands.toml" with { type: "text" }
import MODELS_TEMPLATE from "../../../../config/models.default.toml" with { type: "text" }
import SECRETS_TEMPLATE from "../../../../config/secrets.toml" with { type: "text" }
import { t } from "../i18n"
import { pathForBundleKey, pickBundleFiles } from "./bundle"
import { fetchRemoteConfigBundle } from "./remote-fetch"

function offlineBundle(): Record<string, string> {
  return { "models.toml": MODELS_TEMPLATE, "commands.toml": COMMANDS_TEMPLATE }
}

/** Reports what `kaja config fetch` would change: one line per bundle file (unchanged / new / would update), without writing anything. `offline` compares against the bundled templates instead of the server. */
export async function diffConfig(offline: boolean): Promise<string[]> {
  const bundle = offline ? offlineBundle() : await remoteOrOfflineBundle()
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
    const same = key === "commands.toml" ? sameDefaultCommands(existing, files[key]!) : existing === files[key]
    lines.push(same ? t("config.diffUnchanged", { path }) : t("config.diffWouldUpdate", { path }))
  }
  return lines
}

/** commands.toml's `safe` list is what a fetch replaces; the user's `custom` patterns are kept, so they never make it differ. */
function sameDefaultCommands(existing: string, fetched: string): boolean {
  try {
    return deepEquals(
      CommandsFileSchema.parse(TOML.parse(existing)).safe,
      CommandsFileSchema.parse(TOML.parse(fetched)).safe
    )
  } catch {
    return existing === fetched
  }
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
