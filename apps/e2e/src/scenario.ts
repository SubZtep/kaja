import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { Page } from "playwright-core"
import { webDir } from "./env"
import type { Stack } from "./stack"

const messages = JSON.parse(readFileSync(join(webDir, "messages", "en-GB.json"), "utf8")) as Record<string, string>

/** The web app's English wording for a message key, so a scenario doesn't break on a copy edit. */
export function t(key: string): string {
  const text = messages[key]
  if (text === undefined) throw new Error(`No en-GB message "${key}"`)
  return text
}

export type Context = {
  stack: Stack
  page: Page
  /** An address no earlier run used, so its sign-in mails can't be mixed up. */
  newEmail(): string
  /** Names the part of the scenario in the log, and in the failure report. */
  step(name: string): void
}

export type Scenario = {
  name: string
  run(context: Context): Promise<void>
}

/** A scenario file's default export. */
export function scenario(name: string, run: Scenario["run"]): Scenario {
  return { name, run }
}
