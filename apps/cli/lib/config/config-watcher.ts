import { type FSWatcher, watch } from "node:fs"
import type { KajaPreferences } from "@kaja/schema/config"
import { config, getConfigDir, invalidateConfigCache } from "./config"
import { invalidateSecretsCache } from "./secrets"
import { invalidateServicesCache } from "./services"

// Debounced: a single external save can fire multiple raw fs events (e.g. an
// editor's temp-file-then-rename), and a non-atomic overwrite can be read
// mid-write if reacted to immediately.
const DEBOUNCE_MS = 200

/** Fires with the freshly re-read preferences block whenever settings.toml changes on disk (e.g. hand-edited while kaja is already running). */
export const preferencesEvents = new EventTarget()

let watcher: FSWatcher | undefined
let debounceTimer: ReturnType<typeof setTimeout> | undefined
let pendingFilenames = new Set<string>()

async function handleChangedFiles(filenames: Set<string>) {
  if (filenames.has("services.toml") || filenames.has("secrets.toml")) {
    // services() folds secrets() in, so either file changing invalidates both.
    invalidateServicesCache()
    invalidateSecretsCache()
  }
  if (filenames.has("settings.toml")) {
    invalidateConfigCache()
    try {
      const { preferences } = await config()
      preferencesEvents.dispatchEvent(new CustomEvent<KajaPreferences>("preferences", { detail: preferences }))
    } catch {
      // A transiently partial write (non-atomic overwrite) mid-debounce, or settings.toml
      // momentarily missing/invalid — skip this tick, the next debounced fire retries.
    }
  }
}

/** Watches the config directory for external edits to settings.toml/services.toml/secrets.toml and invalidates the matching in-process cache(s), so a running `kaja` session picks up hand-edited config without a restart. Idempotent: calling twice is a no-op until {@link stopConfigWatcher} runs. */
export function startConfigWatcher() {
  if (watcher) return
  watcher = watch(getConfigDir(), (_event, filename) => {
    if (!filename || !["settings.toml", "services.toml", "secrets.toml"].includes(filename)) return
    pendingFilenames.add(filename)
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      const filenames = pendingFilenames
      pendingFilenames = new Set()
      debounceTimer = undefined
      handleChangedFiles(filenames).catch(() => {})
    }, DEBOUNCE_MS)
  })
  // A watched directory disappearing (e.g. `kaja config wipe`) shouldn't crash the process.
  watcher.on("error", () => {})
}

export function stopConfigWatcher() {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = undefined
  }
  pendingFilenames = new Set()
  watcher?.close()
  watcher = undefined
}
