/** What a hook command can do for us: play a sound, show a desktop notification, or read text aloud. */
export type BackendKind = "player" | "notifier" | "speaker"

export type Backend = {
  kind: BackendKind
  /** The program the command starts, which must be on PATH for it to work. */
  program: string
  /** The shell command for a hook; a player's plays the given sound file of `$KAJA_SOUNDS`. */
  command: (sound?: string) => string
}

export type Which = (program: string) => string | null

const soundPath = (sound = "") => `"$KAJA_SOUNDS/${sound}"`
// Windows commands run through cmd, which hands the quoted PowerShell script over untouched
const powershell = (script: string) => `powershell -NoProfile -Command "${script}"`

const toast =
  "[void][Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]; " +
  "$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent('ToastText02'); " +
  "$text = $xml.GetElementsByTagName('text'); " +
  "[void]$text[0].AppendChild($xml.CreateTextNode($env:KAJA_TITLE)); " +
  "[void]$text[1].AppendChild($xml.CreateTextNode($env:KAJA_TEXT)); " +
  "$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'; " +
  "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show([Windows.UI.Notifications.ToastNotification]::new($xml))"

const player = (program: string, args: string): Backend => ({
  kind: "player",
  program,
  command: sound => `${program} ${args}${soundPath(sound)}`
})

// In the order they are tried; the first one on PATH wins. Every sound is a wav, which each of these plays.
const BACKENDS: Record<string, Backend[]> = {
  linux: [
    player("paplay", ""),
    player("pw-play", ""),
    player("ffplay", "-nodisp -autoexit -loglevel quiet "),
    player("mpv", "--no-video --really-quiet "),
    player("play", "-q "),
    player("aplay", "-q "),
    { kind: "notifier", program: "notify-send", command: () => 'notify-send -- "$KAJA_TITLE" "$KAJA_TEXT"' },
    {
      kind: "notifier",
      program: "kdialog",
      command: () => 'kdialog --title "$KAJA_TITLE" --passivepopup "$KAJA_TEXT" 5'
    },
    { kind: "speaker", program: "espeak-ng", command: () => "espeak-ng --stdin" },
    { kind: "speaker", program: "espeak", command: () => "espeak --stdin" },
    { kind: "speaker", program: "spd-say", command: () => "spd-say -e" }
  ],
  darwin: [
    player("afplay", ""),
    {
      kind: "notifier",
      program: "osascript",
      // Reads the text from the environment, so nothing in it can end up as AppleScript code
      command: () =>
        `osascript -e 'display notification (system attribute "KAJA_TEXT") with title (system attribute "KAJA_TITLE")'`
    },
    { kind: "speaker", program: "say", command: () => "say" }
  ],
  win32: [
    {
      kind: "player",
      program: "powershell",
      command: sound => powershell(`(New-Object Media.SoundPlayer ($env:KAJA_SOUNDS + '\\${sound ?? ""}')).PlaySync()`)
    },
    { kind: "notifier", program: "powershell", command: () => powershell(toast) },
    {
      kind: "speaker",
      program: "powershell",
      command: () =>
        powershell(
          "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak($env:KAJA_TEXT)"
        )
    }
  ]
}

export type Detected = Partial<Record<BackendKind, Backend>>

/** The first backend of each kind whose program is on PATH, for this operating system. */
export function detectBackends(platform: string = process.platform, which: Which = Bun.which): Detected {
  const found: Detected = {}
  for (const backend of BACKENDS[platform] ?? []) {
    if (!found[backend.kind] && which(backend.program)) found[backend.kind] = backend
  }
  return found
}

/** The program a missing backend kind is best installed as, per package manager (Linux; macOS and Windows have them). */
const INSTALL: Record<BackendKind, { program: string; packages: Record<string, string> }> = {
  player: {
    program: "aplay",
    packages: { pacman: "alsa-utils", apt: "alsa-utils", dnf: "alsa-utils", zypper: "alsa-utils", apk: "alsa-utils" }
  },
  notifier: {
    program: "notify-send",
    packages: {
      pacman: "libnotify",
      apt: "libnotify-bin",
      dnf: "libnotify",
      zypper: "libnotify-tools",
      apk: "libnotify"
    }
  },
  speaker: {
    program: "espeak-ng",
    packages: { pacman: "espeak-ng", apt: "espeak-ng", dnf: "espeak-ng", zypper: "espeak-ng", apk: "espeak-ng" }
  }
}

const INSTALL_COMMAND: Record<string, string> = {
  pacman: "sudo pacman -S",
  apt: "sudo apt install",
  dnf: "sudo dnf install",
  zypper: "sudo zypper install",
  apk: "sudo apk add"
}

/** The command that installs what a missing kind needs, e.g. `sudo apt install libnotify-bin`; undefined when unknown. */
export function installHint(
  kind: BackendKind,
  platform: string = process.platform,
  which: Which = Bun.which
): { program: string; command?: string } | undefined {
  if (platform !== "linux") return undefined
  const { program, packages } = INSTALL[kind]
  const manager = Object.keys(INSTALL_COMMAND).find(name => which(name))
  return { program, command: manager && `${INSTALL_COMMAND[manager]} ${packages[manager]}` }
}
