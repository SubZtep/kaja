import { formatDeviceUserCode } from "@kaja/shared/text"
import chalk from "chalk"
import { render } from "ink"
import notifier from "node-notifier"
import open from "open"
import { writeText } from "tinyclip"
import { renderUnicodeCompact } from "uqr"
import App from "../components/layout/app"
import { consolePalette, paint } from "../components/theme"
import { loadToken, SecretsAccessError } from "../lib/auth/credentials"
import { deviceLogin } from "../lib/auth/device-login"
import { getApiBaseUrl } from "../lib/config/api-url"
import { config } from "../lib/config/config"
import { getLanguage, t } from "../lib/i18n"
import { log } from "../lib/logger"
import { resolveTheme } from "../lib/terminal-background"

// The opener (xdg-open, open, PowerShell) exits at once when it hands the URL over; still running this long, it started a browser in the foreground.
const OPENER_WAIT_MS = 3000

// `open` resolves as soon as the opener spawns, so only its exit code says whether a browser took the URL (none on a headless box).
async function openBrowser(url: string): Promise<boolean> {
  try {
    const opener = await open(url)
    const code = await new Promise<number | null | undefined>(resolve => {
      if (opener.exitCode !== null) return resolve(opener.exitCode)
      const timer = setTimeout(resolve, OPENER_WAIT_MS)
      opener.once("exit", exitCode => {
        clearTimeout(timer)
        resolve(exitCode)
      })
    })
    if (code === undefined || code === 0) return true
    log.warn("Browser opener failed for device login", { code })
  } catch (error) {
    log.warn("Failed to open browser for device login", { error })
  }
  return false
}

// Light modules are the glyphs, so they're painted white on black: a light terminal theme would invert the code otherwise.
function qrCode(text: string): string {
  return renderUnicodeCompact(text, { border: 2 })
    .split("\n")
    .map(line => chalk.whiteBright.bgBlack(line))
    .join("\n")
}

// Cursor up one line and clear it: the hints line, which is always the last one printed.
const ERASE_LAST_LINE = "\x1b[1A\x1b[2K"

// Single-key shortcuts while the sign-in waits, before Ink owns stdin; raw mode swallows Ctrl+C, so it exits here. No pause(): under Bun a paused stdin never wakes for Ink's reader (see terminal-background.ts).
function listenForKeys(onKey: (key: string) => void): () => void {
  const stdin = process.stdin
  const wasRaw = stdin.isRaw
  stdin.setRawMode(true)
  const onData = (chunk: Buffer | string) => {
    const key = chunk.toString()
    if (key === "\u0003") {
      stdin.setRawMode(wasRaw)
      process.exit(130)
    }
    onKey(key.toLowerCase())
  }
  stdin.on("data", onData)
  return () => {
    stdin.off("data", onData)
    stdin.setRawMode(wasRaw)
  }
}

/** The stored cloud token, else a device login (the browser opens on the code; L and Q keys for the link and a QR code). */
export async function resolveToken(apiUrl: string): Promise<string> {
  try {
    const stored = await loadToken()
    if (stored) return stored

    console.log(t("cli.pleaseSignIn"))

    let stopKeys: (() => void) | undefined
    let signedIn = false
    const { token } = await deviceLogin(apiUrl, async prompt => {
      const code = formatDeviceUserCode(prompt.userCode)
      const url = prompt.verificationUriComplete ?? prompt.verificationUri
      const palette = consolePalette()
      const showLink = () => {
        console.log(`\n${t("cli.deviceLoginGoTo")} ${paint(palette.user)(prompt.verificationUri)}`)
        console.log(`${t("cli.deviceLoginEnterCode")} ${paint(palette.warning).bold(code)}\n`)
      }
      const showQr = () => console.log(`\n${t("cli.deviceLoginScan")}\n${qrCode(url)}\n`)

      // With the page open the code is already in it, so the link and code are only a key away; otherwise they're printed, and the code goes to the clipboard for a browser opened by hand.
      const opened = await openBrowser(url)
      if (opened) console.log(`\n${t("cli.deviceLoginOpened")}`)
      else {
        showLink()
        await writeText(code)
        notifier.notify({ title: "Kaja", message: t("cli.deviceLoginCodeCopied") }, error => {
          if (error) log.warn("Device login notification failed", { error })
        })
      }
      if (!process.stdin.isTTY || !process.stdout.isTTY || signedIn) return
      // Each key works once: its hint goes, and the hints line is redrawn under what it printed.
      const shortcuts = new Map<string, { label: string; run: () => void }>()
      if (opened) shortcuts.set("l", { label: t("cli.deviceLoginKeyLink"), run: showLink })
      shortcuts.set("q", { label: t("cli.deviceLoginKeyQr"), run: showQr })
      const hints = () =>
        [...shortcuts]
          .map(
            ([letter, { label }]) => `${paint(palette.user).bold(letter.toUpperCase())} ${paint(palette.muted)(label)}`
          )
          .join("   ")
      console.log(hints())
      const stop = listenForKeys(letter => {
        const shortcut = shortcuts.get(letter)
        if (!shortcut) return
        shortcuts.delete(letter)
        process.stdout.write(ERASE_LAST_LINE)
        shortcut.run()
        if (shortcuts.size) console.log(hints())
        else stop()
      })
      // Signed in: the hints left over go too.
      stopKeys = () => {
        stop()
        if (shortcuts.size) process.stdout.write(ERASE_LAST_LINE)
        shortcuts.clear()
      }
    }).finally(() => {
      signedIn = true
      stopKeys?.()
    })
    const { saveAccountLocale } = await import("../lib/auth/account-locale")
    await saveAccountLocale(getLanguage())
    return token
  } catch (error) {
    if (error instanceof SecretsAccessError) {
      const reason = error.cause instanceof Error ? error.cause.message : String(error.cause)
      throw new Error(`${t("cli.secretsUnavailable")} (${reason})`)
    }
    throw error
  }
}

/**
 * Cloud path: reached via `--cloud`, or by default when no local config
 * exists yet (see cli.ts's useLocal check). Resolves an API token (stored
 * credentials, or device login), then renders App in cloud mode, against
 * cloud Nasi over SSE (`<apiUrl>/nasi/*`). No local agent loop or sqlite; this
 * computer's own tools (lib/cloud/computer.ts) run the calls cloud turns hand it.
 */
export async function runCloudSubcommand() {
  const apiUrl = getApiBaseUrl()

  try {
    // cli.ts guarantees settings.toml exists (via createCloud()) before this subcommand runs.
    const { preferences } = await config()
    // Before the sign-in prompt, which is coloured by it, and before render: "auto" queries the terminal over stdin, which Ink is about to take over
    const theme = await resolveTheme(preferences?.theme)
    const token = await resolveToken(apiUrl)
    // This computer's tools for cloud turns, opened while the chat renders (its MCP servers take a moment); without it the chat still runs, with the cloud's tools only.
    const { openComputer } = await import("../lib/cloud/computer")
    const computer = openComputer().catch(error => {
      log.warn("This computer's tools couldn't be opened for cloud chat", { error })
      return undefined
    })
    // As in local mode: quitting kills a running command and closes the MCP servers, even on SIGTERM or a hung server.
    const { installShutdownHandlers } = await import("../lib/cli/headless")
    const shutdown = installShutdownHandlers(async () => {
      await (await computer)?.close()
    })

    const { waitUntilExit } = render(
      <App
        mode="cloud"
        initialPreferences={{ ...preferences, theme }}
        apiUrl={apiUrl}
        token={token}
        computer={computer}
      />,
      {
        alternateScreen: true,
        kittyKeyboard: {
          mode: "auto",
          flags: ["disambiguateEscapeCodes"]
        }
      }
    )
    try {
      await waitUntilExit()
    } finally {
      await shutdown()
    }
    console.log(t("cli.bye"))
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error)
    console.log(paint(consolePalette().danger)(text))
    process.exit(1)
  }
}
