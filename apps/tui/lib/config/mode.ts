import { hasConfiguredChatModel } from "../models/models"
import { readConfigLoose } from "./config"

export type KajaMode = "cloud" | "local"

/**
 * Which backend a launch uses. Precedence: an explicit `--cloud`/`--local` flag, then settings.toml's
 * `preferences.mode` (written by the setup wizard), then the legacy guess for configs predating that
 * field — a usable chat model means local.
 */
export async function resolveMode(flags: { local?: boolean; cloud?: boolean }): Promise<KajaMode> {
  if (flags.cloud) return "cloud"
  if (flags.local) return "local"

  const saved = (await readConfigLoose()).preferences?.mode
  if (saved === "cloud" || saved === "local") return saved

  return (await hasConfiguredChatModel()) ? "local" : "cloud"
}

/** The mode a `--cloud`/`--local` flag forces, or undefined when the wizard should ask. */
export function modeFromFlags(flags: { local?: boolean; cloud?: boolean }): KajaMode | undefined {
  if (flags.cloud) return "cloud"
  if (flags.local) return "local"
  return undefined
}
