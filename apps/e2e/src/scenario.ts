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

/** A scenario step that failed because of the local model (it never produced what the step needs), not because of the app. */
export class ModelFailure extends Error {
  override name = "ModelFailure"
}

export type Context = {
  stack: Stack
  page: Page
  /** An address no earlier run used, so its sign-in mails can't be mixed up. */
  newEmail(): string
  /** Runs a step that depends on what the model says, once more if it fails; a second failure is a {@link ModelFailure}. */
  model<T>(step: () => Promise<T>): Promise<T>
  /** Names the part of the scenario in the log, and in the failure report. */
  step(name: string): void
}

export type ScenarioOptions = {
  /** Needs the local llama.cpp server (started once for the run). */
  llm?: boolean
  /** Record a video; default true, off for scenarios with nothing to see. */
  video?: boolean
}

export type Scenario = ScenarioOptions & {
  name: string
  run(context: Context): Promise<void>
}

/** A scenario file's default export. */
export function scenario(name: string, run: Scenario["run"], options: ScenarioOptions = {}): Scenario {
  return { name, run, ...options }
}
