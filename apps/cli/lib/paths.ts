import { join } from "node:path"
import envPaths from "env-paths"

// Computed fresh on every call rather than as a module-level constant: tests
// run many spec files in one process and mutate XDG_*_HOME per file, so a
// frozen constant would lock in whichever env happened to be set when this
// module first loaded, for the rest of the process.
export function getPaths() {
  return envPaths("kaja", { suffix: "" })
}

/**
 * Every filesystem path the CLI reads or writes, labelled for display (e.g.
 * the first-run screen, `--paths`). Mirrors the getPath()/getXDir() helpers
 * scattered across lib/config, lib/models, lib/memory, lib/personas — kept
 * here as a flat list instead of importing each of those modules, which
 * would pull in their config-loading side effects before a config even
 * exists. `configDir` defaults to the env-paths default but callers pass
 * getConfigDir() so a `--config` override is reflected (paths.ts can't
 * import lib/config/config.ts itself: that module imports this one).
 */
export function listPaths(all = false, configDir = getPaths().config) {
  const paths = getPaths()

  const items = [
    { label: "config", path: join(configDir, "config.json") },
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
