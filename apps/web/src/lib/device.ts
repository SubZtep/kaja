import { Monitor, Smartphone, SquareTerminal } from "lucide-react"
import { m } from "../paraglide/messages.js"

/** A session's device, as the user would name it, with an icon to match. */
export type DeviceInfo = { label: string; icon: typeof Monitor }

const BROWSERS: [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/Firefox\//, "Firefox"],
  [/Chrome\//, "Chrome"],
  // Last: Chrome, Edge and Opera say Safari too
  [/Safari\//, "Safari"]
]

const SYSTEMS: [RegExp, string][] = [
  [/Android/, "Android"],
  [/iPhone|iPad|iPod/, "iOS"],
  [/CrOS/, "ChromeOS"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Windows/, "Windows"],
  [/Linux/, "Linux"]
]

/** "Chrome on Linux", "Kaja terminal 0.29.4" (the CLI sends `kaja-tui/<version>`; older logins only Bun's own agent), or "Unknown device". */
export function describeUserAgent(ua: string): DeviceInfo {
  const terminal = /^kaja-tui\/(\S+)/.exec(ua)
  if (terminal) return { label: m.devices_terminal_version({ version: terminal[1]! }), icon: SquareTerminal }
  if (ua.startsWith("Bun/")) return { label: m.devices_terminal(), icon: SquareTerminal }
  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1]
  const system = SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1]
  const icon = /Mobile|Android|iPhone|iPad/.test(ua) ? Smartphone : Monitor
  if (browser && system) return { label: m.devices_browser_on({ browser, system }), icon }
  return { label: browser ?? system ?? m.devices_unknown(), icon }
}
