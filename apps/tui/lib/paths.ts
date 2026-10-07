import { join } from "node:path"
import envPaths from "env-paths"
import { t } from "./i18n"

/** The CLI's config, data, cache and temp dirs; `KAJA_PROFILE` is appended to every folder name (`kaja-<profile>`), for keeping separate setups side by side. */
export function getPaths() {
  // Computed fresh per call, not cached — tests mutate XDG_*_HOME per spec file.
  return envPaths("kaja", { suffix: Bun.env.KAJA_PROFILE ?? "" })
}

/** Every path the CLI reads/writes, for display (`config paths`, first-run screen). Duplicated as a flat list to avoid importing modules with config side effects. */
export function listPaths(all = false, configDir = getPaths().config) {
  const paths = getPaths()

  const items = [
    { label: t("paths.settings"), path: join(configDir, "settings.toml") },
    { label: t("paths.memorySessions"), path: join(paths.data, "memory.sqlite") },
    { label: t("paths.images"), path: join(paths.data, "files") }
  ]

  if (all) {
    items.push(
      { label: t("paths.models"), path: join(configDir, "models.toml") },
      { label: t("paths.commands"), path: join(configDir, "commands.toml") },
      { label: t("paths.marketplace"), path: join(configDir, "marketplace") },
      { label: t("paths.temp"), path: paths.temp }
    )
  }

  return items
}
