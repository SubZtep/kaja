import { existsSync } from "node:fs"
import { syncSounds } from "../audio/sounds"
import { writeTemplateConfig } from "../config/fetch"
import { getHooksPath } from "../config/hooks"
import { statusLine } from "../doctor/status"
import { t } from "../i18n"
import { type BackendKind, detectBackends, type Detected, installHint, type Which } from "./detect"
import { buildHooksToml } from "./templates"

const KIND_LABEL: Record<BackendKind, string> = {
  player: "hooks.kindPlayer",
  notifier: "hooks.kindNotifier",
  speaker: "hooks.kindSpeaker"
}

function describeKind(kind: BackendKind, found: Detected, platform: string, which: Which) {
  const what = t(KIND_LABEL[kind])
  const backend = found[kind]
  if (backend) return statusLine("success", t("hooks.found", { what, program: backend.program }))
  const hint = installHint(kind, platform, which)
  if (!hint) return statusLine("warning", t("hooks.missing", { what }))
  if (hint.command) return statusLine("warning", t("hooks.missingInstall", { what, command: hint.command }))
  return statusLine("warning", t("hooks.missingProgram", { what, program: hint.program }))
}

/**
 * Sets up hooks.toml for this machine: finds a sound player, a notifier and a speech tool, tells what is missing and
 * how to install it, asks what to switch on, downloads the sound effects and writes the file (an existing one is
 * backed up first, after asking). Needs a terminal; the caller checks.
 */
export async function offerHooks(
  print: (line: string) => void,
  platform: string = process.platform,
  which: Which = Bun.which
): Promise<void> {
  const { askYesNo } = await import("../doctor/prompt")
  const yes = t("hooks.yes")
  const no = t("hooks.no")
  const path = getHooksPath()

  if (existsSync(path) && !(await askYesNo(t("hooks.replaceTitle", { path }), yes, no))) return

  const found = detectBackends(platform, which)
  for (const kind of ["player", "notifier", "speaker"] as const) print(describeKind(kind, found, platform, which))

  const wanted = {
    sounds: !!found.player && (await askYesNo(t("hooks.soundsTitle"), yes, no, { defaultYes: true, yesFirst: true })),
    notifications:
      !!found.notifier &&
      (await askYesNo(t("hooks.notificationsTitle"), yes, no, { defaultYes: true, yesFirst: true })),
    speech:
      !!found.speaker &&
      (await askYesNo(t("hooks.speechTitle", { program: found.speaker.program }), yes, no, { yesFirst: true }))
  }
  if (!wanted.sounds && !wanted.notifications && !wanted.speech) {
    print(statusLine("info", t("hooks.nothing")))
    return
  }

  if (wanted.sounds && !(await syncSounds())) print(statusLine("warning", t("hooks.soundsFailed")))

  const written = await writeTemplateConfig(buildHooksToml(found, wanted), path)
  if (written.unchanged) print(statusLine("success", t("config.fetchedUnchanged", { path })))
  else if (written.backedUpTo)
    print(statusLine("success", t("config.fetchedWithBackup", { path, backup: written.backedUpTo })))
  else print(statusLine("success", t("config.fetched", { path })))
}
