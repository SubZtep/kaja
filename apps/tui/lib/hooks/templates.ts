import type { HookCommand, HookName } from "@kaja/schema/config"
import type { Detected } from "./detect"

/** Which sound each hook plays; the files are the ones `syncSounds` downloads. */
const SOUNDS: Partial<Record<HookName, string>> = {
  message: "hehe.wav",
  question: "bell.wav",
  confirm: "bell.wav",
  reasoning: "wind.wav",
  notice: "wind.wav",
  tool_call: "magic.wav",
  persona_switch: "magic.wav",
  error: "error.wav",
  copy: "keyboard.wav"
}

const NOTIFICATIONS: HookName[] = ["question", "confirm", "persona_switch", "login_code"]

const SPEECH: HookName[] = ["message", "question"]

// A TOML literal string reads best (no escaping); one with a quote in it falls back to a JSON string, which TOML shares
const tomlString = (text: string) => (text.includes("'") ? JSON.stringify(text) : `'${text}'`)

/**
 * The text of a hooks.toml for what was found on this machine: sounds, notifications and reading messages aloud, each
 * only when asked for and a command was detected. Speech commands share the "speech" cancel name, so a new reply
 * interrupts the one still being read. The speaker reads in `$KAJA_LOCALE`, set when the hook runs.
 */
export function buildHooksToml(
  found: Detected,
  wanted: { sounds: boolean; notifications: boolean; speech: boolean }
): string {
  const hooks = new Map<HookName, HookCommand[]>()
  const add = (name: HookName, command: HookCommand) => hooks.set(name, [...(hooks.get(name) ?? []), command])

  const { player, notifier, speaker } = found
  if (wanted.sounds && player) {
    for (const [name, sound] of Object.entries(SOUNDS) as [HookName, string][])
      add(name, { run: player.command(sound) })
  }
  if (wanted.notifications && notifier) {
    for (const name of NOTIFICATIONS) add(name, { run: notifier.command() })
  }
  if (wanted.speech && speaker) {
    for (const name of SPEECH) add(name, { run: speaker.command(), cancel: "speech" })
  }

  const tables = [...hooks].flatMap(([name, commands]) =>
    commands.map(({ run, cancel }) =>
      [`[[${name}]]`, `run = ${tomlString(run)}`, ...(typeof cancel === "string" ? [`cancel = "${cancel}"`] : [])].join(
        "\n"
      )
    )
  )
  return `# Written by \`kaja config hooks\`: each [[event]] starts a shell command in the background when that happens.\n\n${tables.join("\n\n")}\n`
}
