import { join } from "node:path"
import { compileSafeCommands, DEFAULT_SAFE_COMMANDS } from "@kaja/nasi"
import { CommandsFileSchema } from "@kaja/schema/config"
import { file, TOML } from "bun"
import { log } from "../logger"
import { getConfigDir } from "./config"

export function getCommandsPath() {
  return join(getConfigDir(), "commands.toml")
}

/**
 * The compiled patterns of commands that run without asking: the built-in list plus commands.toml's `custom`, when the
 * user has written one. A broken file or pattern never stops the app: it is logged and skipped.
 */
export async function loadSafeCommands(): Promise<RegExp[]> {
  const path = getCommandsPath()
  const f = file(path)
  let custom: string[] = []
  if (await f.exists()) {
    try {
      custom = CommandsFileSchema.parse(TOML.parse(await f.text())).custom
    } catch (error) {
      log.warn("commands.toml is invalid, using only the built-in safe commands", { path, error })
    }
  }
  const { patterns, invalid } = compileSafeCommands([...DEFAULT_SAFE_COMMANDS, ...custom])
  for (const source of invalid) log.warn("Ignoring an invalid pattern in commands.toml", { path, pattern: source })
  return patterns
}
