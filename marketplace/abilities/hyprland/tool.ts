// Hyprland (0.56+, Lua config) through hyprctl: read options and errors, and try changes live without touching a file.
// The model never sends Lua: hypr_preview builds the hl.config()/hl.animation() call itself from checked names and values,
// since a Lua string could run commands (hl.dsp.exec_cmd, os.execute).

const OPTION = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/
const LEAF = /^[a-zA-Z0-9_]+$/
const STYLE = /^[a-z0-9 %]+$/
const TIMEOUT_MS = 5000

type Gradient = { colors: string[]; angle?: number }
type OptionValue = number | boolean | string | Gradient
type Animation = { leaf: string; enabled?: boolean; speed?: number; bezier?: string; spring?: string; style?: string }

// hyprctl's output, or an error saying why it couldn't run.
async function hyprctl(...args: string[]): Promise<{ ok: boolean; out: string }> {
  if (!Bun.which("hyprctl")) throw new Error("hyprctl isn't installed here, so Hyprland can't be reached.")
  if (!Bun.env.HYPRLAND_INSTANCE_SIGNATURE)
    throw new Error("Hyprland isn't running in this session (no HYPRLAND_INSTANCE_SIGNATURE).")
  const child = Bun.spawn(["hyprctl", ...args], { stdout: "pipe", stderr: "pipe", timeout: TIMEOUT_MS })
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited
  ])
  return { ok: code === 0, out: `${out}${err}`.trim() }
}

// A Lua string literal; control characters are refused rather than escaped.
function luaString(value: string): string {
  if ([...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
    throw new Error(`Control characters aren't allowed in ${JSON.stringify(value)}.`)
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}

function luaNumber(value: unknown, what: string): string {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${what} must be a number.`)
  return String(value)
}

function luaValue(name: string, value: unknown): string {
  if (typeof value === "number") return luaNumber(value, name)
  if (typeof value === "boolean") return String(value)
  if (typeof value === "string") return luaString(value)
  if (typeof value === "object" && value !== null && Array.isArray((value as Gradient).colors)) {
    const { colors, angle } = value as Gradient
    if (colors.length === 0 || colors.length > 10) throw new Error(`${name}: a gradient takes 1 to 10 colors.`)
    const list = colors.map(color => luaString(String(color))).join(", ")
    return `{ colors = { ${list} }${angle === undefined ? "" : `, angle = ${luaNumber(angle, `${name}'s angle`)}`} }`
  }
  throw new Error(`${name}: a value is a number, true/false, a string, or a gradient { colors, angle }.`)
}

function luaAnimation(animation: Animation): string {
  if (typeof animation?.leaf !== "string" || !LEAF.test(animation.leaf))
    throw new Error("Each animation needs a leaf such as windows, workspaces, fade or border.")
  const fields = [`leaf = ${luaString(animation.leaf)}`]
  if (animation.enabled !== undefined) fields.push(`enabled = ${animation.enabled === true}`)
  if (animation.speed !== undefined) fields.push(`speed = ${luaNumber(animation.speed, "speed")}`)
  // A curve by the name the config gives it with hl.curve: a bezier or a spring, as its type says.
  for (const kind of ["bezier", "spring"] as const) {
    const curve = animation[kind]
    if (curve === undefined) continue
    if (!LEAF.test(curve)) throw new Error(`Not a curve name: ${curve}`)
    fields.push(`${kind} = ${luaString(curve)}`)
  }
  if (animation.style !== undefined) {
    if (!STYLE.test(animation.style)) throw new Error(`Not a style: ${animation.style}`)
    fields.push(`style = ${luaString(animation.style)}`)
  }
  return `hl.animation({ ${fields.join(", ")} })`
}

export const hyprCheck = {
  definition: {
    type: "function" as const,
    function: {
      name: "hypr_check",
      description:
        "Hyprland's version, its current config errors (empty means the config loaded cleanly), and the current values of the options asked for.",
      parameters: {
        type: "object",
        properties: {
          options: {
            type: "array",
            items: { type: "string" },
            description: "Option names in dotted form, e.g. decoration.rounding, general.col.active_border"
          }
        }
      }
    }
  },
  readOnly: true,
  execute: async (args: { options?: string[] }) => {
    const version = (await hyprctl("version")).out.split("\n")[0]
    const errors = (await hyprctl("configerrors")).out
    const lines = [version, errors ? `Config errors:\n${errors}` : "Config errors: none"]
    for (const option of args.options ?? []) {
      if (!OPTION.test(option)) {
        lines.push(`${option}: not an option name (use the dotted form, e.g. decoration.rounding)`)
        continue
      }
      const { out } = await hyprctl("-j", "getoption", option)
      lines.push(`${option}: ${out}`)
    }
    return lines.join("\n")
  }
}

export const hyprPreview = {
  definition: {
    type: "function" as const,
    function: {
      name: "hypr_preview",
      description:
        "Try Hyprland options and animations live, without changing any file: the user sees it at once, and the next config reload (or saving any config file) undoes it. Returns ok, or Hyprland's error (an unknown option, a bad value).",
      parameters: {
        type: "object",
        properties: {
          options: {
            type: "object",
            description:
              'Dotted option names to values: a number, true/false, a string (colors as "rgba(82dcccff)"), or a gradient { "colors": [..], "angle": 45 }. E.g. { "decoration.rounding": 14, "decoration.blur.size": 6 }',
            additionalProperties: true
          },
          animations: {
            type: "array",
            description:
              "hl.animation entries to try, e.g. [{ leaf: 'windows', speed: 4, spring: 'easy', style: 'popin 80%' }]",
            items: {
              type: "object",
              properties: {
                leaf: { type: "string" },
                enabled: { type: "boolean" },
                speed: { type: "number", description: "In tenths of a second (lower is faster)" },
                bezier: { type: "string", description: "A bezier curve the config defines with hl.curve" },
                spring: { type: "string", description: "A spring curve the config defines with hl.curve" },
                style: { type: "string" }
              },
              required: ["leaf"]
            }
          }
        }
      }
    }
  },
  execute: async (args: { options?: Record<string, OptionValue>; animations?: Animation[] }) => {
    const entries = Object.entries(args.options ?? {})
    const animations = args.animations ?? []
    if (entries.length === 0 && animations.length === 0) throw new Error("Give some options or animations to try.")
    for (const [name] of entries)
      if (!OPTION.test(name))
        throw new Error(`${name}: not an option name (use the dotted form, e.g. decoration.rounding)`)
    const calls = [
      ...(entries.length
        ? [
            `hl.config({ ${entries.map(([name, value]) => `[${luaString(name)}] = ${luaValue(name, value)}`).join(", ")} })`
          ]
        : []),
      ...animations.map(luaAnimation)
    ]
    for (const [index, call] of calls.entries()) {
      const { ok, out } = await hyprctl("eval", call)
      if (ok && out === "ok") continue
      const applied = index > 0 ? " (the parts before it were applied)" : ""
      throw new Error(`${out || "Hyprland refused the change."}${applied}`)
    }
    return "Applied live. It lasts until the config reloads; save it to the config file to keep it."
  }
}
