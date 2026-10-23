import { expect, test } from "bun:test"
import { HooksFileSchema } from "@kaja/schema/config"
import { TOML } from "bun"
import { detectBackends } from "../../../lib/hooks/detect"
import { buildHooksToml } from "../../../lib/hooks/templates"

const linux = detectBackends("linux", program => `/usr/bin/${program}`)
const windows = detectBackends("win32", program => `C:\\${program}`)
const all = { sounds: true, notifications: true, speech: true }

const parse = (text: string) => HooksFileSchema.parse(TOML.parse(text))

test("sounds, notifications and speech each add their commands to the events", () => {
  const hooks = parse(buildHooksToml(linux, all))
  expect(hooks.message).toEqual([
    { run: 'paplay "$KAJA_SOUNDS/hehe.wav"' },
    { run: "espeak-ng --stdin", cancel: "speech" }
  ])
  expect(hooks.question?.map(command => command.run)).toEqual([
    'paplay "$KAJA_SOUNDS/bell.wav"',
    'notify-send -- "$KAJA_TITLE" "$KAJA_TEXT"',
    "espeak-ng --stdin"
  ])
  expect(hooks.login_code).toEqual([{ run: 'notify-send -- "$KAJA_TITLE" "$KAJA_TEXT"' }])
  expect(hooks.copy).toEqual([{ run: 'paplay "$KAJA_SOUNDS/keyboard.wav"' }])
})

test("only what was asked for is written", () => {
  const hooks = parse(buildHooksToml(linux, { sounds: false, notifications: true, speech: false }))
  expect(Object.keys(hooks).sort()).toEqual(["confirm", "login_code", "persona_switch", "question"])
  expect(buildHooksToml({}, all)).not.toMatch(/^\[\[/m)
})

test("the Windows PowerShell commands, with their quotes, survive being written as TOML", () => {
  const text = buildHooksToml(windows, all)
  const hooks = parse(text)
  expect(hooks.message?.[0]?.run).toContain("Media.SoundPlayer")
  expect(hooks.persona_switch?.map(command => command.run).join("\n")).toContain("ToastNotificationManager")
})
