import { mkdirSync, renameSync } from "node:fs"
import { join } from "node:path"
import { type Browser, chromium, type Page } from "playwright-core"
import { e2eDir, e2eEnv } from "./env"
import { ModelFailure, type Scenario } from "./scenario"
import type { Stack } from "./stack"

export type Result = {
  name: string
  ok: boolean
  seconds: number
  /** One clip per recorded page. */
  videos: string[]
  error?: string
  /** Who failed: the app, or the model behind it (a flaky answer, not necessarily a bug). */
  kind?: "app" | "model"
}

/** How long a scenario's last screen stays up, so the clip ends on it. */
const LINGER_MS = 1500

const outDir = join(e2eDir, e2eEnv.E2E_OUT_DIR)

function browserPath(): string {
  const found =
    e2eEnv.E2E_BROWSER ??
    ["chromium", "google-chrome", "chrome"].map(name => Bun.which(name)).find(Boolean) ??
    undefined
  if (!found) throw new Error("No Chromium found on PATH; set E2E_BROWSER")
  return found
}

export function launchBrowser(): Promise<Browser> {
  return chromium.launch({ executablePath: browserPath(), headless: !e2eEnv.E2E_HEADED })
}

/** Runs one scenario in a fresh browser context that records a video; a failure also leaves a screenshot. */
export async function runScenario(browser: Browser, stack: Stack, scenario: Scenario, file: string): Promise<Result> {
  const clips = join(outDir, "clips")
  mkdirSync(clips, { recursive: true })
  const context = await browser.newContext({
    locale: "en-GB",
    viewport: { width: 1280, height: 720 },
    ...(scenario.video === false
      ? {}
      : { recordVideo: { dir: join(outDir, "raw"), size: { width: 1280, height: 720 } } })
  })
  const pages: { label: string; page: Page }[] = []
  const open = async (label: string) => {
    const opened = await context.newPage()
    pages.push({ label, page: opened })
    return opened
  }
  stack.telegram.reset()
  const page = await open("web")
  const started = performance.now()
  let current = "start"
  let error: string | undefined
  let kind: Result["kind"]
  try {
    await scenario.run({
      stack,
      page,
      newPage: open,
      model: async step => {
        try {
          return await step()
        } catch (first) {
          console.log(`  ↻ model step failed, retrying once: ${(first as Error).message}`)
          try {
            return await step()
          } catch (second) {
            throw new ModelFailure((second as Error).message)
          }
        }
      },
      newEmail: () => `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@example.test`,
      step: name => {
        current = name
        console.log(`  · ${name}`)
      }
    })
  } catch (caught) {
    error = `at "${current}": ${(caught as Error).message}`
    kind = caught instanceof ModelFailure ? "model" : "app"
    for (const { label, page: shown } of pages) {
      await shown.screenshot({ path: join(outDir, `${file}.${label}.failed.png`) }).catch(() => {})
    }
  }
  // The recorder drops what changed in the last moments before the context closes
  if (scenario.video !== false) await Bun.sleep(LINGER_MS)
  // A page the scenario never opened anything on has nothing to show
  const recorded = pages
    .filter(({ page: recordedPage }) => recordedPage.url() !== "about:blank")
    .map(({ label, page: recordedPage }) => ({ label, video: recordedPage.video() }))
  await context.close()
  const videos: string[] = []
  for (const { label, video } of recorded) {
    if (!video) continue
    const clip = join(clips, `${file}.${label}.webm`)
    renameSync(await video.path(), clip)
    videos.push(clip)
  }
  const seconds = (performance.now() - started) / 1000
  return {
    name: scenario.name,
    ok: !error,
    seconds,
    videos,
    ...(error ? { error, kind } : {})
  }
}
