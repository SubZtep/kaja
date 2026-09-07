import { join } from "node:path"
import envPaths from "env-paths"
import { t } from "./i18n"

// Computed fresh per call, not cached — tests mutate XDG_*_HOME per spec file.
export function getPaths() {
  return envPaths("kaja", { suffix: "" })
}

/** Every path the CLI reads/writes, for display (`config paths`, first-run screen). Duplicated as a flat list to avoid importing modules with config side effects. */
export function listPaths(all = false, configDir = getPaths().config) {
  const paths = getPaths()

  const items = [
    { label: t("paths.settings"), path: join(configDir, "settings.toml") },
    { label: t("paths.memorySessions"), path: join(paths.data, "memory.sqlite") }
  ]

  if (all) {
    items.push(
      { label: t("paths.models"), path: join(configDir, "models.toml") },
      { label: t("paths.mcpServers"), path: join(configDir, "mcp.toml") },
      { label: t("paths.services"), path: join(configDir, "services.toml") },
      { label: t("paths.personas"), path: join(configDir, "personas") },
      { label: t("paths.datasets"), path: join(configDir, "datasets") },
      { label: t("paths.tools"), path: join(configDir, "tools") },
      { label: t("paths.temp"), path: paths.temp }
    )
  }

  return items
}
