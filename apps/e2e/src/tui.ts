import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import type { Page } from "playwright-core"
import { e2eDir, e2eEnv } from "./env"
import type { Stack } from "./stack"

const COLS = 120
const ROWS = 32
const PROFILE = "e2e"
const tuiDir = join(e2eDir, "..", "tui")
const xtermDir = join(e2eDir, "node_modules", "@xterm", "xterm")

const KEYS = {
  enter: "\r",
  escape: "\x1b",
  tab: "\t",
  up: "\x1b[A",
  down: "\x1b[B",
  right: "\x1b[C",
  left: "\x1b[D",
  backspace: "\x7f"
} as const

export type Tui = {
  /** The visible screen and scrollback as text. */
  screen(): Promise<string>
  /** Waits until the screen shows `text` (or matches the pattern); returns the screen. */
  waitFor(text: string | RegExp, timeoutMs?: number): Promise<string>
  type(text: string): void
  /** Types `text` and presses Enter, apart from it: Ink reads text and Enter in one chunk as a paste and doesn't submit. */
  submit(text: string): Promise<void>
  press(key: keyof typeof KEYS): void
  /** Ctrl+<letter>, or Alt+<letter> with `alt`. */
  chord(letter: string, options?: { alt?: boolean }): void
  /** Every URL the TUI handed to the "browser" (see bin/fake-browser.sh), oldest first. */
  openedUrls(): string[]
  /** Resolves with the exit code once the program has ended (or throws if it doesn't within the time). */
  waitForExit(timeoutMs?: number): Promise<number>
  stop(): Promise<void>
}

/** Draws the page the terminal is shown on: xterm.js in a dark window, sized to the PTY. */
async function drawTerminal(page: Page, send: (data: string) => void): Promise<void> {
  await page.exposeFunction("__send", send)
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:#0b0f0c;display:flex;justify-content:center;align-items:center;height:100vh">
      <div id="term" style="padding:12px;border-radius:8px;background:#000;box-shadow:0 12px 40px #000a"></div></body></html>`
  )
  await page.addStyleTag({ path: join(xtermDir, "css", "xterm.css") })
  await page.addScriptTag({ path: join(xtermDir, "lib", "xterm.js") })
  await page.evaluate(
    ({ cols, rows }) => {
      // biome-ignore lint/suspicious/noExplicitAny: xterm.js comes from the script tag
      const w = window as any
      const term = new w.Terminal({
        cols,
        rows,
        fontSize: 15,
        fontFamily: "monospace",
        cursorBlink: false,
        allowProposedApi: true,
        theme: { background: "#000000" }
      })
      term.open(document.getElementById("term"))
      // Answers to the terminal queries Ink makes (cursor position, device attributes) go back to the program
      term.onData((data: string) => w.__send(data))
      w.term = term
    },
    { cols: COLS, rows: ROWS }
  )
}

/**
 * Runs the real TUI (`apps/tui/cli.ts`, cloud mode) in a PTY against the stack and shows it on `page`.
 * It gets its own empty config, data and keychain entry (profile `e2e`), and its "browser" only records URLs.
 */
export async function startTui(
  stack: Stack,
  page: Page,
  args: string[] = ["--cloud"],
  { fresh = true }: { fresh?: boolean } = {}
): Promise<Tui> {
  const home = join(e2eDir, e2eEnv.E2E_OUT_DIR, "tui-home")
  // `fresh: false` is a later launch of the same setup: its config and login are kept
  if (fresh) {
    rmSync(home, { recursive: true, force: true })
    // A token from an earlier run belongs to a database that is gone
    await Bun.secrets.delete({ service: `kaja-tui-${PROFILE}`, name: "token" }).catch(() => {})
  }
  mkdirSync(home, { recursive: true })
  const opened = join(home, "opened-urls.txt")
  writeFileSync(opened, "")

  let write: (data: string) => void = () => {}
  await drawTerminal(page, data => write(data))

  const decoder = new TextDecoder()
  let pending = ""
  let flushing = false
  const flush = async () => {
    if (flushing) return
    flushing = true
    try {
      while (pending) {
        const chunk = pending
        pending = ""
        await page.evaluate(data => (window as unknown as { term: { write(d: string): void } }).term.write(data), chunk)
        await Bun.sleep(20)
      }
    } catch {
      // The page closed with the scenario
    } finally {
      flushing = false
    }
  }

  const child = Bun.spawn(["bun", "cli.ts", ...args], {
    cwd: tuiDir,
    env: {
      ...process.env,
      KAJA_API_URL: stack.apiUrl,
      KAJA_PROFILE: PROFILE,
      XDG_CONFIG_HOME: join(home, "config"),
      XDG_DATA_HOME: join(home, "data"),
      XDG_CACHE_HOME: join(home, "cache"),
      XDG_STATE_HOME: join(home, "state"),
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      // xdg-open (bundled with `open`) falls back to $BROWSER when it finds no desktop
      BROWSER: join(e2eDir, "bin", "fake-browser.sh"),
      E2E_OPENED_URLS: opened,
      XDG_CURRENT_DESKTOP: "",
      DESKTOP_SESSION: "",
      DISPLAY: "",
      WAYLAND_DISPLAY: ""
    },
    terminal: {
      cols: COLS,
      rows: ROWS,
      data(_terminal, data) {
        pending += decoder.decode(data, { stream: true })
        void flush()
      }
    }
  })
  write = data => child.terminal?.write(data)

  const screen = () =>
    page.evaluate(() => {
      const buffer = (
        window as unknown as {
          term: {
            buffer: {
              active: { length: number; getLine(i: number): { translateToString(trim: boolean): string } | undefined }
            }
          }
        }
      ).term.buffer.active
      const lines: string[] = []
      for (let i = 0; i < buffer.length; i++) lines.push(buffer.getLine(i)?.translateToString(true) ?? "")
      return lines.join("\n").trimEnd()
    })

  return {
    screen,
    async waitFor(text, timeoutMs = 30_000) {
      const deadline = Date.now() + timeoutMs
      let last = ""
      while (Date.now() < deadline) {
        last = await screen()
        if (typeof text === "string" ? last.includes(text) : text.test(last)) return last
        if (child.exitCode !== null)
          throw new Error(`The TUI exited (${child.exitCode}) before showing ${text}\n${last}`)
        await Bun.sleep(200)
      }
      throw new Error(`The TUI never showed ${text} within ${timeoutMs} ms. Screen:\n${last}`)
    },
    type: text => write(text),
    submit: async text => {
      write(text)
      await Bun.sleep(300)
      write(KEYS.enter)
    },
    press: key => write(KEYS[key]),
    chord: (letter, options) => {
      const code = String.fromCharCode(letter.toUpperCase().charCodeAt(0) - 64)
      write(options?.alt ? `\x1b${letter}` : code)
    },
    openedUrls: () => readFileSync(opened, "utf8").split("\n").filter(Boolean),
    async waitForExit(timeoutMs = 15_000) {
      const timedOut = Symbol("timeout")
      const result = await Promise.race([child.exited, Bun.sleep(timeoutMs).then(() => timedOut)])
      if (result === timedOut)
        throw new Error(`The TUI was still running ${timeoutMs} ms later. Screen:\n${await screen()}`)
      return result as number
    },
    async stop() {
      child.kill()
      await child.exited
    }
  }
}
