import { expect, test } from "bun:test"
import { detectBackends, installHint } from "../../../lib/hooks/detect"

const only =
  (...programs: string[]) =>
  (program: string) =>
    programs.includes(program) ? `/usr/bin/${program}` : null

test("the first player, notifier and speaker on PATH are picked, in order of preference", () => {
  const found = detectBackends("linux", only("aplay", "paplay", "kdialog", "notify-send", "espeak", "espeak-ng"))
  expect(found.player?.program).toBe("paplay")
  expect(found.notifier?.program).toBe("notify-send")
  expect(found.speaker?.program).toBe("espeak-ng")
})

test("what isn't installed is left out", () => {
  expect(detectBackends("linux", only())).toEqual({})
  expect(detectBackends("linux", only("aplay")).notifier).toBeUndefined()
})

test("macOS and Windows use what ships with them", () => {
  const mac = detectBackends("darwin", only("afplay", "osascript", "say"))
  expect([mac.player?.program, mac.notifier?.program, mac.speaker?.program]).toEqual(["afplay", "osascript", "say"])

  const windows = detectBackends("win32", only("powershell"))
  expect(windows.player?.program).toBe("powershell")
  expect(windows.notifier?.command()).toContain("ToastNotificationManager")
  expect(windows.speaker?.command()).toContain("$env:KAJA_TEXT")
})

test("a player plays the named file from the sounds folder", () => {
  expect(detectBackends("linux", only("paplay")).player?.command("bell.wav")).toBe('paplay "$KAJA_SOUNDS/bell.wav"')
  expect(detectBackends("linux", only("ffplay")).player?.command("bell.wav")).toBe(
    'ffplay -nodisp -autoexit -loglevel quiet "$KAJA_SOUNDS/bell.wav"'
  )
  expect(detectBackends("win32", only("powershell")).player?.command("bell.wav")).toContain("'\\bell.wav'")
})

test("the notification command takes its words from the environment, never from the shell line", () => {
  const command = detectBackends("linux", only("notify-send")).notifier!.command()
  expect(command).toBe('notify-send -- "$KAJA_TITLE" "$KAJA_TEXT"')
  expect(detectBackends("darwin", only("osascript")).notifier!.command()).toContain('system attribute "KAJA_TEXT"')
})

test("a missing tool comes with the install command for the package manager found", () => {
  expect(installHint("notifier", "linux", only("apt"))).toEqual({
    program: "notify-send",
    command: "sudo apt install libnotify-bin"
  })
  expect(installHint("speaker", "linux", only("pacman"))?.command).toBe("sudo pacman -S espeak-ng")
  expect(installHint("player", "linux", only("dnf"))?.command).toBe("sudo dnf install alsa-utils")
})

test("without a known package manager only the program is named, and other systems get no hint", () => {
  expect(installHint("notifier", "linux", only())).toEqual({ program: "notify-send", command: undefined })
  expect(installHint("notifier", "darwin", only())).toBeUndefined()
})
