import { rename, rm } from "node:fs/promises"
import { basename, dirname } from "node:path"
import { consolePalette, paint } from "../../components/theme"
import pkg from "../../package.json" with { type: "json" }
import type { KajaMode } from "../config/mode"
import { t } from "../i18n"
import { log } from "../logger"

// The TUI's GitHub release is always the one marked latest (the API and web ones are pre-releases), with the manifest install.sh reads.
const MANIFEST_URL = "https://github.com/SubZtep/kaja/releases/latest/download/manifest.json"
const RELEASE_URL = "https://github.com/SubZtep/kaja/releases/latest"
const INSTALL_CMD = {
  unix: "curl -fsSL https://kaja.io/install.sh | bash",
  windows: "irm https://kaja.io/install.ps1 | iex"
} as const
// A slow network only delays startup this long; past it the check counts as failed.
const TIMEOUT_MS = 3000

/** The version in a release manifest (`"version": "tui@1.2.3"`), or null when it isn't one. */
export function manifestVersion(manifest: unknown): string | null {
  const version = (manifest as { version?: unknown } | null)?.version
  if (typeof version !== "string") return null
  const match = /^tui@(\d+\.\d+\.\d+(?:[-+]\S*)?)$/.exec(version)
  return match?.[1] ?? null
}

/** The latest released TUI version, or null when it can't be found out (offline, GitHub down, a bad manifest). */
export async function latestVersion(fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await fetchImpl(MANIFEST_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!response.ok) return null
    return manifestVersion(await response.json())
  } catch (error) {
    log.warn("Update check failed", { error })
    return null
  }
}

/** Whether `latest` is newer than `current`. */
export function isNewer(latest: string, current: string): boolean {
  return Bun.semver.order(latest, current) > 0
}

// The installed binary, not `bun cli.ts` from a checkout, which updates with git.
function isCompiled(): boolean {
  return !/^bun(\.exe)?$/i.test(basename(process.execPath))
}

// Runs the website's installer into the running binary's folder, its output in this terminal; true when it finished.
async function runInstaller(): Promise<boolean> {
  const windows = process.platform === "win32"
  const target = process.execPath
  // A shell's VERSION or REPO would pin the installer to another release.
  const { VERSION: _version, REPO: _repo, ...env } = process.env
  const cmd = windows
    ? ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", INSTALL_CMD.windows]
    : ["bash", "-c", `set -o pipefail; ${INSTALL_CMD.unix}`]
  // Windows can't replace a running exe, but can rename it; the next start removes it.
  const old = `${target}.old`
  if (windows) {
    await rm(old, { force: true })
    await rename(target, old)
  }
  const installer = Bun.spawn(cmd, {
    env: { ...env, INSTALL_DIR: dirname(target) },
    stdio: ["inherit", "inherit", "inherit"]
  })
  const ok = (await installer.exited) === 0
  if (windows && !ok && !(await Bun.file(target).exists())) await rename(old, target)
  return ok
}

function printManual(): void {
  const command = INSTALL_CMD[process.platform === "win32" ? "windows" : "unix"]
  console.log(t("update.manual", { command: paint(consolePalette().user)(command), url: RELEASE_URL }))
}

/**
 * Every start of the installed binary: when a newer version is out, offers to install it in a terminal. Cloud mode
 * doesn't start an old version, so the API only ever talks to the latest TUI; local mode can carry on. `--headless`
 * (always local) only says so, since a prompt would keep an unattended bot from starting. A check that can't reach
 * GitHub never stops it.
 */
export async function checkForUpdate(mode: KajaMode, headless = false): Promise<void> {
  if (!isCompiled()) return
  if (!headless && (!process.stdin.isTTY || !process.stdout.isTTY)) return
  if (process.platform === "win32") await rm(`${process.execPath}.old`, { force: true }).catch(() => undefined)
  const latest = await latestVersion()
  if (!latest || !isNewer(latest, pkg.version)) return

  const palette = consolePalette()
  console.log(paint(palette.warning)(t("update.available", { latest, current: pkg.version })))
  if (headless) return printManual()
  if (mode === "cloud") console.log(t("update.cloudNeedsLatest"))

  const { askYesNo } = await import("../doctor/prompt")
  const yes = await askYesNo(
    t("update.title"),
    t("update.yes"),
    mode === "cloud" ? t("update.quit") : t("update.later"),
    {
      defaultYes: true,
      yesFirst: true
    }
  )
  if (yes) {
    const installed = await runInstaller().catch(error => {
      log.warn("Update install failed", { error })
      return false
    })
    if (installed) {
      console.log(paint(palette.success)(t("update.done", { latest })))
      process.exit(0)
    }
    console.log(paint(palette.danger)(t("update.failed")))
    printManual()
    process.exit(1)
  }
  if (mode === "local") return
  printManual()
  process.exit(1)
}
