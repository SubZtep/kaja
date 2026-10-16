import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { delimiter, join } from "node:path"
import { personaAbilities } from "@kaja/nasi"
import type { ToolHost } from "@kaja/schema/config"
import { statusLine } from "../doctor/status"
import { t } from "../i18n"
import { log } from "../logger"
import { loadPersonas } from "../personas/personas"
import { getMarketplaceDir } from "./abilities-file"
import { missingPrograms } from "./list"
import { toolHosts } from "./sandbox-relay"

const UV_INSTALL = {
  unix: "curl -LsSf https://astral.sh/uv/install.sh | sh",
  windows: 'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"'
} as const
const CHROME_URL = "https://www.google.com/chrome/"

/** A stdio ability some persona uses that can't start on this computer, and isn't sent to a sandbox. */
export type Unrunnable = { name: string; needs: string[]; requires: string[]; localOnly: boolean }

/** The stdio abilities some persona uses that can't start here (a missing runner, or Chrome) and stay on this computer. */
export async function unrunnableAbilities(): Promise<Unrunnable[]> {
  const { scanMcpAbilities } = await import("@kaja/nasi")
  const used = new Set((await loadPersonas()).flatMap(persona => [...personaAbilities(persona).keys()]))
  return pickUnrunnable(await scanMcpAbilities(getMarketplaceDir()), used, await toolHosts())
}

/** {@link unrunnableAbilities} over a scan: missing something, used by a persona, and not sent to a sandbox. */
export function pickUnrunnable(
  entries: { name: string; needs?: string[]; requires?: string[]; localOnly?: boolean }[],
  used: Set<string>,
  hosts: Record<string, ToolHost>
): Unrunnable[] {
  return entries.flatMap(entry =>
    (entry.needs || entry.requires) && used.has(entry.name) && hosts[entry.name] !== "sandbox"
      ? [{ name: entry.name, needs: entry.needs ?? [], requires: entry.requires ?? [], localOnly: !!entry.localOnly }]
      : []
  )
}

type Choice = "skip" | "uv" | "chrome" | "sandbox"

/**
 * For each ability {@link unrunnableAbilities} finds: install what it needs (uv through its official installer; Chrome
 * has none, so its download page opens), run it on a Kaja sandbox (signing in when there's no token yet), or skip it
 * with how to install it by hand. Asks again after an install, since one install may cover several abilities.
 */
export async function offerAbilityHosts(print: (line: string) => void): Promise<void> {
  const { askPick } = await import("../doctor/prompt")
  const asked = new Set<string>()
  for (;;) {
    const next = (await unrunnableAbilities()).find(ability => !asked.has(ability.name))
    if (!next) return
    asked.add(next.name)
    const choices: Choice[] = [
      "skip",
      ...(next.needs.includes("uvx") ? (["uv"] as const) : []),
      ...(next.requires.includes("Chrome") ? (["chrome"] as const) : []),
      ...(next.localOnly ? [] : (["sandbox"] as const))
    ]
    const labels: Record<Choice, string> = {
      skip: t("wizard.hostSkip"),
      uv: t("wizard.hostInstallUv"),
      chrome: t("wizard.hostGetChrome"),
      sandbox: t("wizard.hostSandbox")
    }
    const title = t("wizard.hostTitle", {
      name: next.name,
      programs: missingPrograms(next.needs, next.requires)
    })
    const picked =
      choices[
        (await askPick(
          title,
          choices.map(choice => labels[choice])
        )) ?? 0
      ]!
    await apply(picked, next, print)
  }
}

async function apply(choice: Choice, ability: Unrunnable, print: (line: string) => void) {
  if (choice === "sandbox") return runOnSandbox(ability.name, print)
  if (choice === "uv") return installUv(print)
  if (choice === "chrome") {
    const { default: open } = await import("open")
    await open(CHROME_URL).catch(error => log.warn("Couldn't open the Chrome download page", { error }))
    return print(statusLine("info", t("wizard.hostChromeAt", { url: CHROME_URL })))
  }
  print(
    statusLine(
      "info",
      ability.needs.includes("uvx")
        ? t("wizard.hostSkippedUv", { name: ability.name, command: uvCommand() })
        : ability.requires.includes("Chrome")
          ? t("wizard.hostSkippedChrome", { name: ability.name, url: CHROME_URL })
          : t("wizard.hostSkipped", { name: ability.name, programs: missingPrograms(ability.needs, ability.requires) })
    )
  )
}

/** Records `name` as a sandbox ability in settings.toml, and signs in to Kaja cloud when there's no token yet. */
async function runOnSandbox(name: string, print: (line: string) => void) {
  const { getConfigPath, invalidateConfigCache } = await import("../config/config")
  const { setTomlValue } = await import("../config/toml")
  await setTomlValue(getConfigPath(), "tools.hosts", name, '"sandbox"')
  invalidateConfigCache()
  const { loadToken } = await import("../auth/credentials")
  const token = await loadToken().catch(() => undefined)
  if (!token) {
    try {
      const { resolveToken } = await import("../../subcommands/run-cloud")
      const { getApiBaseUrl } = await import("../config/api-url")
      await resolveToken(getApiBaseUrl())
    } catch (error) {
      log.warn("Sign-in for a sandbox ability failed", { error })
      return print(statusLine("warning", t("wizard.hostSignInFailed", { name })))
    }
  }
  print(statusLine("success", t("wizard.hostSandboxSet", { name })))
}

function uvCommand(): string {
  return UV_INSTALL[process.platform === "win32" ? "windows" : "unix"]
}

/**
 * Runs uv's official installer in this terminal, then adds its bin folder to this process's PATH so uvx is found now.
 * Judged by whether uvx is there afterwards: `curl … | sh` exits 0 even when the download failed.
 */
async function installUv(print: (line: string) => void) {
  const command = uvCommand()
  const cmd =
    process.platform === "win32"
      ? ["powershell", "-ExecutionPolicy", "ByPass", "-c", "irm https://astral.sh/uv/install.ps1 | iex"]
      : ["sh", "-c", command]
  await Bun.spawn(cmd, { stdio: ["inherit", "inherit", "inherit"] }).exited.catch(error =>
    log.warn("uv's installer didn't run", { error })
  )
  const bin = process.env.XDG_BIN_HOME ?? join(homedir(), ".local", "bin")
  if (existsSync(bin) && !(process.env.PATH ?? "").split(delimiter).includes(bin))
    process.env.PATH = `${bin}${delimiter}${process.env.PATH ?? ""}`
  const installed = Bun.which("uvx", { PATH: process.env.PATH ?? "" }) !== null
  print(
    installed
      ? statusLine("success", t("wizard.hostInstalled"))
      : statusLine("error", t("wizard.hostInstallFailed", { command }))
  )
}
