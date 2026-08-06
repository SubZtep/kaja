import { join } from "node:path"
import envPaths from "env-paths"

// Computed fresh per call, not cached — tests mutate XDG_*_HOME per spec file.
export function getPaths() {
  return envPaths("kaja", { suffix: "" })
}

/** Every path the CLI reads/writes, for display (--paths, first-run screen). Duplicated as a flat list to avoid importing modules with config side effects. */
export function listPaths(all = false, configDir = getPaths().config) {
  const paths = getPaths()

  const items = [
    { label: "settings", path: join(configDir, "settings.json") },
    { label: "memory & sessions", path: join(paths.data, "memory.sqlite") }
  ]

  if (all) {
    items.push(
      { label: "models", path: join(configDir, "models.toml") },
      { label: "mcp servers", path: join(configDir, "mcp.toml") },
      { label: "services", path: join(configDir, "services.toml") },
      { label: "personas", path: join(configDir, "personas") },
      { label: "datasets", path: join(configDir, "datasets") },
      { label: "tools", path: join(configDir, "tools") },
      { label: "log", path: join(paths.cache, "kaja.log") },
      { label: "temp", path: paths.temp }
    )
  }

  return items
}
