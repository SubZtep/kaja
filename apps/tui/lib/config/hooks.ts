import { readFileSync } from "node:fs"
import { join } from "node:path"
import { type HookCommand, type HookName, HooksFileSchema, type KajaHooksFile } from "@kaja/schema/config"
import { TOML } from "bun"
import { log } from "../logger"
import { getSoundsDir } from "../paths"
import { getConfigDir } from "./config"

export type { HookName }

export function getHooksPath() {
  return join(getConfigDir(), "hooks.toml")
}

/**
 * The hooks from hooks.toml. The file is optional (the setup wizard and `kaja config hooks` write it); a missing or
 * broken one means no hooks (a broken one is logged).
 */
export function loadHooks(): KajaHooksFile {
  const path = getHooksPath()
  let text: string
  try {
    text = readFileSync(path, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT")
      log.warn("hooks.toml is unreadable, no hooks", { path, error })
    return {}
  }
  try {
    return HooksFileSchema.parse(TOML.parse(text))
  } catch (error) {
    log.warn("hooks.toml is invalid, no hooks", { path, error })
    return {}
  }
}

/** What a hook is about: `text` is in `$KAJA_TEXT` and on stdin, `title` in `$KAJA_TITLE`. */
export type HookEvent = { text?: string; title?: string }

let loaded: KajaHooksFile | undefined
// Still-running commands by their `cancel` key, so the next run with that key can stop them
const running = new Map<string, Bun.Subprocess>()

/** Forgets the loaded hooks.toml and the running commands, so the next {@link fireHook} reads the file again. */
export function resetHooks() {
  loaded = undefined
  running.clear()
}

function cancelKey({ run, cancel }: HookCommand) {
  if (cancel === true) return `command:${run}`
  return typeof cancel === "string" ? `group:${cancel}` : undefined
}

// The command leads its own process group (set up in runHook), so the shell's children stop with it
function stop(proc: Bun.Subprocess) {
  try {
    process.kill(-proc.pid, "SIGTERM")
  } catch {
    proc.kill()
  }
}

/**
 * Starts a hook's command in the background without waiting for it. With `cancel` set, a run of the same command or
 * group that is still going is stopped first. A failure is logged, never thrown.
 */
export function runHook(name: HookName, command: HookCommand, { text = "", title = "Kaja" }: HookEvent = {}) {
  const shell = process.platform === "win32" ? ["cmd", "/c", command.run] : ["sh", "-c", command.run]
  const key = cancelKey(command)
  const previous = key && running.get(key)
  if (previous) stop(previous)

  try {
    const proc = Bun.spawn(shell, {
      env: { ...process.env, KAJA_HOOK: name, KAJA_TEXT: text, KAJA_TITLE: title, KAJA_SOUNDS: getSoundsDir() },
      stdin: new TextEncoder().encode(text),
      stdout: "ignore",
      stderr: "ignore",
      detached: process.platform !== "win32"
    })
    // Not tracked, so a spoken reply or a notification outlives the TUI instead of dying with it
    proc.unref()
    if (key) running.set(key, proc)
    void proc.exited.then(code => {
      if (key && running.get(key) === proc) running.delete(key)
      // A cancelled run ends by signal, which is no error
      if (code !== 0 && proc.signalCode === null)
        log.warn("hook exited with an error", { hook: name, command: command.run, code })
    })
  } catch (error) {
    log.warn("hook failed to start", { hook: name, command: command.run, error })
  }
}

/** Runs every command hooks.toml lists for `name` (read on first use), all at once. No such hook: nothing happens. */
export function fireHook(name: HookName, event: HookEvent = {}) {
  loaded ??= loadHooks()
  for (const command of loaded[name] ?? []) runHook(name, command, event)
}
