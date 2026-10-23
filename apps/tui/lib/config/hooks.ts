import { readFileSync } from "node:fs"
import { join } from "node:path"
import { HooksFileSchema, type KajaHooksFile } from "@kaja/schema/config"
import { TOML } from "bun"
import { log } from "../logger"
import { getConfigDir } from "./config"

export type HookName = keyof KajaHooksFile

export function getHooksPath() {
  return join(getConfigDir(), "hooks.toml")
}

/**
 * The hooks from hooks.toml. The file is optional and never written; a missing or broken one means no hooks (a broken
 * one is logged).
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

/**
 * Starts a hook's command in the background without waiting for it; `text` is in `$KAJA_TEXT` and on stdin. A failure
 * is logged, never thrown.
 */
export function runHook(name: HookName, command: string, text: string) {
  const shell = process.platform === "win32" ? ["cmd", "/c", command] : ["sh", "-c", command]
  try {
    const proc = Bun.spawn(shell, {
      env: { ...process.env, KAJA_HOOK: name, KAJA_TEXT: text },
      stdin: new TextEncoder().encode(text),
      stdout: "ignore",
      stderr: "ignore"
    })
    // Not tracked, so a spoken reply or a notification outlives the TUI instead of dying with it
    proc.unref()
    void proc.exited.then(code => {
      if (code !== 0) log.warn("hook exited with an error", { hook: name, command, code })
    })
  } catch (error) {
    log.warn("hook failed to start", { hook: name, command, error })
  }
}
