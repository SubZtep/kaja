import { ThemeProvider } from "@inkjs/ui"
import type { ModelTask } from "@kaja/schema/config"
import { LOCALE_LABELS, locales } from "@kaja/shared/locale"
import { capitalized } from "@kaja/shared/text"
import { Box, Text } from "ink"
import { useEffect, useRef, useState } from "react"
import type { KajaMode } from "../lib/config/mode"
import type { BackendKind } from "../lib/hooks/detect"
import type { WantedHooks } from "../lib/hooks/templates"
import type { Language } from "../lib/i18n"
import { setLanguage, t } from "../lib/i18n"
import {
  candidatesByTask,
  CATALOG,
  type CatalogProvider,
  catalogProvider,
  type ModelPick,
  resolvePicks,
  TASK_ORDER
} from "../lib/models/catalog"
import { sameAddress } from "../lib/models/detect"
import type { ThemeName } from "../lib/terminal-background"
import { CheckMenu } from "./elem/check-menu"
import { KeyHint, LABEL_WIDTH, padLabel, Question, RailLine, RecentAnswer, textWidth } from "./elem/rail"
import { SelectMenu } from "./elem/select-menu"
import { InputPrompt, type LiveCheck, Problem } from "./secret-prompt"
import { themeFor, useKajaTheme } from "./theme"

/** Optional features, each needing one more answer afterwards. None is ticked by default. */
export type WizardExtra = "telegram"

const EXTRA_CHOICES: WizardExtra[] = ["telegram"]

const EXTRA_LABEL_KEY: Record<WizardExtra, string> = {
  telegram: "wizard.extraTelegram"
}

const EXTRA_SHORT_KEY: Record<WizardExtra, string> = {
  telegram: "wizard.extraTelegramShort"
}

/** A provider that isn't in the catalog: any OpenAI-compatible server the user names. */
export type WizardCustom = {
  /** The `[providers.<name>]` key, already reduced to letters, numbers and dashes. */
  name?: string
  baseUrl?: string
  /** Its models. A model waits for its task, which is asked right after the id. */
  models: { model: string; task?: ModelTask }[]
  /** The user has listed all the models they want. */
  done?: boolean
  /** Came from models.toml: its models are reviewed in one checklist, not asked one by one. */
  saved?: boolean
  /** How many models the review kept; new ones are asked after them. */
  reviewed?: number
}

/** Offered right after what's in use or found, in this order: a first run shouldn't open on 230 names A to Z. */
const POPULAR_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "openrouter",
  "xai",
  "mistral",
  "deepseek",
  "groq",
  "fireworks-ai",
  "togetherai"
]

/**
 * The checklist's groups: `found` ones (in use, key in the environment), the popular ones in their own order, then the
 * rest in the catalog's order, by name.
 */
export function providerGroups(
  providers: CatalogProvider[],
  found: (provider: CatalogProvider) => boolean
): { found: CatalogProvider[]; popular: CatalogProvider[]; rest: CatalogProvider[] } {
  const others = providers.filter(provider => !found(provider))
  const popular = POPULAR_PROVIDERS.flatMap(id => others.filter(provider => provider.id === id))
  return {
    found: providers.filter(found),
    popular,
    rest: others.filter(provider => !popular.includes(provider))
  }
}

/** What the checklist stores for "a provider that isn't listed". */
const CUSTOM = "custom"

/**
 * Everything the wizard collects. The keys are asked for here rather than by the credential pass afterwards, so a key
 * is typed while its question is still on screen; but nothing is written here: the caller hands them to that pass,
 * which tests and saves each one.
 *
 * `""` means the step was shown and skipped, `undefined` that it never applied. The caller needs both: a key the user
 * has already declined must not be asked for a second time.
 */
export type WizardResult = {
  mode?: KajaMode
  language?: Language
  /** Prefilled with the saved theme, else the one detected from the terminal's background. */
  theme?: ThemeName
  /**
   * The ticked catalog providers, in catalog order, and `custom` last when that was ticked. Never empty once asked:
   * local mode can't start without one.
   */
  providers?: string[]
  custom?: WizardCustom
  /** Model servers found running on this machine: offered first in the checklist, ticked on a first run. */
  local?: CatalogProvider[]
  /**
   * Providers models.toml already has that the wizard doesn't ask about (the catalog doesn't know them, and the custom
   * steps cover only one): written back as they are, so a re-run never drops them.
   */
  keep?: CatalogProvider[]
  /** The tasks to set up; chat is always among them. */
  tasks?: ModelTask[]
  /** Typed API keys by provider id; only hosted providers are asked. */
  keys?: Record<string, string>
  /** Providers whose key is read from an environment variable, by id: secrets.toml names the variable, not the key. */
  keyEnv?: Record<string, string>
  /** Where each local provider's server listens. */
  addresses?: Record<string, string>
  /** The model picked for each task that had more than one to choose from; the rest take the best guess. */
  models?: Partial<Record<ModelTask, ModelPick>>
  extras?: WizardExtra[]
  telegramToken?: string
  /** Use the online marketplace (on unless turned off); fetched after the wizard, when git can. */
  marketplace?: boolean
  /** Pull the marketplace at startup when it's a day old; asked only with the marketplace on. */
  autoFetch?: boolean
  /** Sounds, notifications and speech, each asked only when this machine has a program for it. */
  hooks?: Partial<WantedHooks>
}

/** The program found for each kind of hook, e.g. `paplay` for sounds: a kind without one isn't asked about. */
export type HookPrograms = Partial<Record<BackendKind, string>>

type HookStep = keyof WantedHooks

const HOOK_STEPS: { step: HookStep; kind: BackendKind; title: string; label: string; on: boolean }[] = [
  { step: "sounds", kind: "player", title: "hooks.soundsTitle", label: "wizard.summarySounds", on: true },
  {
    step: "notifications",
    kind: "notifier",
    title: "hooks.notificationsTitle",
    label: "wizard.summaryNotifications",
    on: true
  },
  // Reading every message aloud surprises more people than it helps, so it's off unless asked for
  { step: "speech", kind: "speaker", title: "hooks.speechTitle", label: "wizard.summarySpeech", on: false }
]

/** Each kind of hook switched on or off: the answer, else its default, and always off without a program for it. */
export function chosenHooks(result: WizardResult, programs: HookPrograms = {}): WantedHooks {
  const pick = ({ step, kind, on }: (typeof HOOK_STEPS)[number]) =>
    Boolean(programs[kind]) && (result.hooks?.[step] ?? on)
  return {
    sounds: pick(HOOK_STEPS[0]!),
    notifications: pick(HOOK_STEPS[1]!),
    speech: pick(HOOK_STEPS[2]!)
  }
}

/** An answer the runner can test while it's typed: a key against its provider, an address, a bot token. */
export type ProbeTarget =
  | { kind: "key"; baseUrl: string; key: string }
  | { kind: "address"; baseUrl: string }
  | { kind: "telegram"; token: string }

/** Which secrets are already in secrets.toml, so their step can offer to keep what's there. */
export type WizardSaved = {
  /** Provider names with an `api_key` already saved — a list, since the step can pick any of them. */
  providers?: string[]
  telegram?: boolean
  /** The last 4 characters of each saved key, by provider (and `telegram`), so a step can say which one Enter keeps. */
  tails?: Record<string, string>
}

/**
 * One question. The key, address and model steps repeat, so they carry what they are about: `key:fireworks`,
 * `address:ollama`, `model:chat`.
 */
type Step =
  | "mode"
  | "language"
  | "theme"
  | "providers"
  | `key:${string}`
  | `address:${string}`
  | "tasks"
  | `model:${ModelTask}`
  | "custom-name"
  | "custom-url"
  | "custom-key"
  | "custom-review"
  | `custom-model:${number}`
  | `custom-task:${number}`
  | "extras"
  | "telegramToken"
  | "marketplace"
  | "autoFetch"
  | HookStep
  | "done"

/** The parts the questions are grouped in, in the order they are asked; the header shows where you are among them. */
type Block = "basics" | "providers" | "models" | "extras" | "sounds"

const BLOCK_ORDER: Block[] = ["basics", "providers", "models", "extras", "sounds"]

const BLOCK_LABEL_KEY: Record<Block, string> = {
  basics: "wizard.blockBasics",
  providers: "wizard.blockProviders",
  models: "wizard.blockModels",
  extras: "wizard.blockExtras",
  sounds: "wizard.blockSounds"
}

// By the step's kind, the part before any `:`. A custom provider's models say what its server has, so they sit in Providers.
const BLOCK_OF_KIND: Record<string, Block> = {
  language: "basics",
  theme: "basics",
  mode: "basics",
  providers: "providers",
  key: "providers",
  address: "providers",
  "custom-name": "providers",
  "custom-url": "providers",
  "custom-key": "providers",
  "custom-review": "providers",
  "custom-model": "providers",
  "custom-task": "providers",
  tasks: "models",
  model: "models",
  extras: "extras",
  telegramToken: "extras",
  marketplace: "extras",
  autoFetch: "extras",
  sounds: "sounds",
  notifications: "sounds",
  speech: "sounds"
}

function blockOf(step: Step): Block | undefined {
  return BLOCK_OF_KIND[step.split(":")[0]!]
}

const TASK_LABEL_KEY: Record<ModelTask, string> = {
  chat: "wizard.taskChat",
  embedding: "wizard.taskEmbedding",
  rerank: "wizard.taskRerank",
  "image-generation": "wizard.taskImageGeneration",
  tts: "wizard.taskTts",
  stt: "wizard.taskStt",
  summarize: "wizard.taskSummarize",
  vision: "wizard.taskVision"
}

const MODE_CHOICES: KajaMode[] = ["cloud", "local"]

const THEME_CHOICES: ThemeName[] = ["dark", "light", "terminal"]

const THEME_SHORT_KEY: Record<ThemeName, string> = {
  dark: "wizard.themeDarkShort",
  light: "wizard.themeLightShort",
  terminal: "wizard.themeTerminalShort"
}

const THEME_LABEL_KEY: Record<ThemeName, string> = {
  dark: "wizard.themeDark",
  light: "wizard.themeLight",
  terminal: "wizard.themeTerminal"
}

/** A name reduced to what a TOML table key and a secrets.toml entry can carry; never one the catalog already owns. */
function customId(name: string): string {
  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return catalogProvider(id) ? `${id}-custom` : id
}

/** Whether `value` is an http(s) address, the only kind an OpenAI-compatible API can be reached on. */
function isWebAddress(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === "http:" || protocol === "https:"
  } catch {
    return false
  }
}

/**
 * The ticked providers. Without a catalog (offline) or a server found running there is nothing to tick: the user's own
 * provider is the only one, asked for detail by detail.
 */
function tickedProviders(result: WizardResult): string[] {
  return CATALOG.length === 0 && !result.local?.length ? [CUSTOM] : (result.providers ?? [])
}

/** The custom provider as a catalog entry, once it has an address and at least one model with its task. */
function customProvider(result: WizardResult): CatalogProvider | undefined {
  const custom = result.custom
  if (!tickedProviders(result).includes(CUSTOM) || !custom?.name || !custom.baseUrl) return undefined
  const byModel = new Map<string, ModelTask[]>()
  for (const { model, task } of custom.models) if (task) byModel.set(model, [...(byModel.get(model) ?? []), task])
  if (byModel.size === 0) return undefined
  const models = [...byModel].map(([model, tasks]) => ({ model, tasks }))
  return { id: custom.name, name: custom.name, kind: "hosted", baseUrl: custom.baseUrl, models, own: true }
}

/** The ticked providers from the catalog, in catalog order. */
function catalogChoices(result: WizardResult): CatalogProvider[] {
  return CATALOG.filter(provider => result.providers?.includes(provider.id))
}

/** The ticked servers found running here. */
function localChoices(result: WizardResult): CatalogProvider[] {
  return (result.local ?? []).filter(provider => result.providers?.includes(provider.id))
}

/**
 * Every ticked provider, the servers found running here, then the custom one, then those kept from models.toml.
 * Exported for the runner, which writes models.toml from it.
 */
export function chosenProviders(result: WizardResult): CatalogProvider[] {
  const custom = customProvider(result)
  const keep = (result.keep ?? []).filter(provider => provider.id !== custom?.id)
  return [...catalogChoices(result), ...localChoices(result), ...(custom ? [custom] : []), ...keep]
}

/** Ticked on a first run: what a chat with memory and pictures needs. Voice and the rest are opt-in. */
const DEFAULT_TASKS: ModelTask[] = ["chat", "embedding", "summarize", "vision"]

/** The tasks some chosen provider has a model for, in models.toml's order. */
function availableTasks(result: WizardResult): ModelTask[] {
  const candidates = candidatesByTask(chosenProviders(result))
  return TASK_ORDER.filter(task => candidates[task]?.length)
}

/** The tasks being set up: the ones ticked (the defaults until asked) that some chosen provider can serve. */
function selectedTasks(result: WizardResult): ModelTask[] {
  const wanted = result.tasks ?? DEFAULT_TASKS
  return availableTasks(result).filter(task => wanted.includes(task))
}

/** The selected tasks with more than one model to choose from: the only model questions worth asking. */
function askedTasks(result: WizardResult): ModelTask[] {
  const candidates = candidatesByTask(chosenProviders(result))
  return selectedTasks(result).filter(task => (candidates[task]?.length ?? 0) > 1)
}

/** Each selected task's model: the one picked, else the best guess. Exported for the runner, which writes them. */
export function chosenPicks(result: WizardResult): Partial<Record<ModelTask, ModelPick>> {
  return resolvePicks(chosenProviders(result), selectedTasks(result), result.models)
}

/**
 * Every question this set of answers leads to, in order. Cloud needs no provider; a hosted provider is asked for a key
 * and a local one for an address; then which tasks to set up, and a model for each that has a choice; and each extra's
 * follow-up only when that extra was ticked. Recomputed after every answer, so a skipped step never mounts just to
 * advance out of itself.
 */
function stepsFor(result: WizardResult, forcedMode?: KajaMode, programs: HookPrograms = {}, git = false): Step[] {
  // `--cloud`/`--local` already answered the mode. A prefilled mode does not: that's the current
  // setting being re-offered, which the user is here to change.
  const steps: Step[] = forcedMode === undefined ? ["language", "theme", "mode"] : ["language", "theme"]
  // Cloud chat plays the same sounds, so these are asked in both modes, last
  const hooks = HOOK_STEPS.filter(hook => programs[hook.kind]).map(hook => hook.step)
  if (result.mode === "cloud") return [...steps, ...hooks, "done"]

  if (CATALOG.length > 0 || result.local?.length) steps.push("providers")
  for (const provider of catalogChoices(result)) {
    steps.push(provider.kind === "hosted" ? `key:${provider.id}` : `address:${provider.id}`)
  }
  if (tickedProviders(result).includes(CUSTOM)) {
    steps.push("custom-name", "custom-url", "custom-key")
    const custom = result.custom
    const models = custom?.models ?? []
    // A saved provider's models are reviewed in one list; only the ones added after it are asked one by one
    if (custom?.saved) steps.push("custom-review")
    const first = custom?.saved ? (custom.reviewed ?? models.length) : 0
    for (let index = first; index < models.length; index++) {
      steps.push(`custom-model:${index}`, `custom-task:${index}`)
    }
    // Ask for another model until the user ends the list, but never while the last one still needs its task.
    if (!result.custom?.done && models.at(-1)?.task !== undefined) steps.push(`custom-model:${models.length}`)
    else if (models.length === 0) steps.push("custom-model:0")
  }
  // One task to choose from is no choice: chat alone is set up without asking.
  if (availableTasks(result).length > 1) steps.push("tasks")
  for (const task of askedTasks(result)) steps.push(`model:${task}`)
  // Every extra is a local-agent feature: the Telegram bot.
  steps.push("extras")
  if (result.extras?.includes("telegram")) steps.push("telegramToken")
  // Personas and abilities come from the marketplace, which only the local agent loads, and only git can fetch
  if (git) {
    steps.push("marketplace")
    if (result.marketplace !== false) steps.push("autoFetch")
  }
  steps.push(...hooks, "done")
  return steps
}

function nextStepAfter(
  step: Step,
  result: WizardResult,
  forcedMode?: KajaMode,
  programs?: HookPrograms,
  git?: boolean
): Step {
  const steps = stepsFor(result, forcedMode, programs, git)
  const at = steps.indexOf(step)
  if (at !== -1) return steps[at + 1] ?? "done"
  // The step that just ended the custom model list is no longer in the list, so carry on after the custom ones.
  const lastCustom = steps.findLastIndex(candidate => candidate.startsWith("custom"))
  return steps[lastCustom + 1] ?? "done"
}

function providerName(id: string, result?: WizardResult): string {
  const local = result?.local?.find(provider => provider.id === id)
  if (id === CUSTOM) return result?.custom?.name ?? t("wizard.providerCustom")
  return catalogProvider(id)?.name ?? local?.name ?? id
}

/**
 * What happened to a key step: typed, left empty over one already saved, or left empty. Undefined when the step never
 * applied.
 */
function keyState(typed: string | undefined, alreadySaved: boolean | undefined): string | undefined {
  if (typed === undefined) return undefined
  if (typed) return t("wizard.keyStateEntered")
  return t(alreadySaved ? "wizard.keyStateKept" : "wizard.keyStateSkipped")
}

/** The environment variable a custom provider's key would usually be in, e.g. `MY_BOX_API_KEY`. */
function envGuess(name: string): string {
  return `${name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`
}

// Without `id`: the rest of the record, so a key typed and a key read from the environment never both apply
function without<T>(record: Record<string, T> | undefined, id: string): Record<string, T> {
  const { [id]: _, ...rest } = record ?? {}
  return rest
}

// The last 4 characters of a key long enough not to give it away, for "Enter keeps the key (…Qx7f)"
const tailOf = (key: string | undefined) => (key && key.length >= 12 ? key.slice(-4) : undefined)

// A key step's empty field: Enter keeps a key typed earlier (you came back to it) or one already saved, else skips
function keyPlaceholder(typed: string | undefined, alreadySaved: boolean | undefined, savedTail?: string): string {
  const tail = typed ? tailOf(typed) : savedTail
  const which = typed ? "Typed" : alreadySaved ? "Saved" : undefined
  if (!which) return t("wizard.keySkips")
  return tail ? t(`wizard.keyKeeps${which}Tail`, { tail }) : t(`wizard.keyKeeps${which}`)
}

/** A key step's hint: Enter saves, and how the key is handled. */
function keyHint() {
  return <KeyHint keys={[["Enter", t("hint.save")]]} note={t("wizard.keyNote")} />
}

/** One answered step, kept on screen above the next question. */
type Answer = { id: string; label: string; value: string }

type AnswerLine = Pick<Answer, "label" | "value"> | undefined
type AnswerLineFn = (subject: string, result: WizardResult, saved?: WizardSaved) => AnswerLine

// A key step's line: never the key itself, only what became of it.
function keyLine(label: string, typed: string | undefined, alreadySaved: boolean | undefined): AnswerLine {
  const value = keyState(typed, alreadySaved)
  return value ? { label, value } : undefined
}

// A key read from the environment: the variable's name, never its value.
function envLine(id: string, name: string, result: WizardResult): AnswerLine {
  const env = result.keyEnv?.[id]
  return env
    ? { label: t("wizard.summaryKeyProvider", { provider: name }), value: t("wizard.keyStateEnv", { env }) }
    : undefined
}

// A line only when there is a value to show.
function lineIf(label: string, value: string | undefined): AnswerLine {
  return value ? { label, value } : undefined
}

const ANSWER_LINES: Record<string, AnswerLineFn> = {
  language: (_, result) => lineIf(t("wizard.summaryLanguage"), result.language && LOCALE_LABELS[result.language]),
  theme: (_, result) => lineIf(t("wizard.summaryTheme"), result.theme && t(THEME_LABEL_KEY[result.theme])),
  mode: (_, result) =>
    lineIf(
      t("wizard.summaryMode"),
      result.mode && t(result.mode === "cloud" ? "wizard.modeCloudShort" : "wizard.modeLocalShort")
    ),
  providers: (_, result) => ({
    label: t("wizard.summaryProvider"),
    value: (result.providers ?? []).map(id => providerName(id, result)).join(", ")
  }),
  key: (subject, result, saved) =>
    envLine(subject, providerName(subject), result) ??
    keyLine(
      t("wizard.summaryKeyProvider", { provider: providerName(subject) }),
      result.keys?.[subject],
      saved?.providers?.includes(subject)
    ),
  address: (subject, result) =>
    lineIf(t("wizard.summaryAddress", { provider: providerName(subject) }), result.addresses?.[subject]),
  tasks: (_, result) =>
    lineIf(
      t("wizard.summaryTasks"),
      selectedTasks(result)
        .map(task => t(TASK_LABEL_KEY[task]))
        .join(", ")
    ),
  model: (subject, result) => {
    const task = subject as ModelTask
    const picked = chosenPicks(result)[task]
    return lineIf(
      capitalized(t("wizard.summaryModel", { task: t(TASK_LABEL_KEY[task]) })),
      picked && `${providerName(picked.provider, result)} (${picked.model})`
    )
  },
  "custom-name": (_, result) => lineIf(t("wizard.summaryCustom"), result.custom?.name),
  "custom-url": (_, result) =>
    lineIf(t("wizard.summaryAddress", { provider: result.custom?.name ?? "" }), result.custom?.baseUrl),
  "custom-key": (_, result, saved) => {
    const id = result.custom?.name ?? ""
    return (
      envLine(id, id, result) ??
      keyLine(t("wizard.summaryKeyProvider", { provider: id }), result.keys?.[id], saved?.providers?.includes(id))
    )
  },
  "custom-review": (_, result) =>
    lineIf(t("wizard.summaryCustomModels"), t("wizard.customModelsKept", { count: result.custom?.models.length ?? 0 })),
  "custom-task": (subject, result) => {
    const entry = result.custom?.models[Number(subject)]
    return lineIf(t("wizard.summaryCustomModel"), entry?.task && `${entry.model} (${t(TASK_LABEL_KEY[entry.task])})`)
  },
  extras: (_, result) =>
    lineIf(
      t("wizard.summaryExtras"),
      result.extras?.length ? result.extras.map(e => t(EXTRA_LABEL_KEY[e])).join(", ") : undefined
    ),
  telegramToken: (_, result, saved) => keyLine(t("wizard.summaryKeyTelegram"), result.telegramToken, saved?.telegram),
  marketplace: (_, result) =>
    lineIf(t("wizard.summaryMarketplace"), t(result.marketplace === false ? "hooks.no" : "hooks.yes")),
  autoFetch: (_, result) =>
    lineIf(t("wizard.summaryAutoFetch"), t(result.autoFetch === false ? "hooks.no" : "hooks.yes")),
  ...Object.fromEntries(
    HOOK_STEPS.map(hook => [
      hook.step,
      (_: string, result: WizardResult) =>
        lineIf(t(hook.label), t((result.hooks?.[hook.step] ?? hook.on) ? "hooks.yes" : "hooks.no"))
    ])
  )
}

/**
 * The line a finished step leaves behind. Never a key's value, only what became of it. A step that recorded nothing (no
 * extras ticked) leaves no line.
 */
function answerLine(step: Step, result: WizardResult, saved?: WizardSaved): AnswerLine {
  const [kind, subject = ""] = step.split(":") as [string, string | undefined]
  return ANSWER_LINES[kind]?.(subject, result, saved)
}

// Each finished block's short answers, for its folded line: no labels, the shortest form of each answer
const FOLDS: Record<Block, (result: WizardResult, asked: Set<string>, saved?: WizardSaved) => string[]> = {
  basics: (result, asked) => [
    ...(asked.has("language") && result.language ? [LOCALE_LABELS[result.language]] : []),
    ...(asked.has("theme") && result.theme ? [t(THEME_SHORT_KEY[result.theme])] : []),
    ...(asked.has("mode") && result.mode
      ? [t(result.mode === "cloud" ? "wizard.modeCloudShort" : "wizard.modeLocalShort")]
      : [])
  ],
  providers: (result, _, saved) => {
    const names = (result.providers ?? []).map(id =>
      id === CUSTOM && result.custom?.name ? result.custom.name : providerName(id, result)
    )
    const ids = [
      ...catalogChoices(result)
        .filter(p => p.kind === "hosted")
        .map(p => p.id),
      result.custom?.name ?? ""
    ]
    // Enter on a key already saved keeps it
    const kept = (id: string) => result.keys?.[id] === "" && saved?.providers?.includes(id)
    const set = ids.filter(id => result.keys?.[id] || result.keyEnv?.[id] || kept(id)).length
    const skipped = ids.filter(id => result.keys?.[id] === "" && !kept(id)).length
    return [
      names.join(", "),
      ...(set > 0 ? [t("wizard.foldKeysSet", { count: set })] : []),
      ...(skipped > 0 ? [t("wizard.foldKeysSkipped", { count: skipped })] : [])
    ].filter(Boolean)
  },
  models: result =>
    Object.entries(chosenPicks(result)).map(
      ([task, pick]) => `${capitalized(t(TASK_LABEL_KEY[task as ModelTask]))} ${pick.model.split("/").at(-1)}`
    ),
  extras: (result, asked, saved) => {
    const on = [
      ...(result.extras ?? []).map(extra =>
        // A bot without a token can't start, which is worth saying
        extra === "telegram" && result.telegramToken === "" && !saved?.telegram
          ? t("wizard.foldNoToken", { name: t(EXTRA_SHORT_KEY[extra]) })
          : t(EXTRA_SHORT_KEY[extra])
      ),
      ...(asked.has("marketplace")
        ? [
            result.marketplace === false
              ? t("wizard.foldOff", { name: t("wizard.summaryMarketplace") })
              : t("wizard.summaryMarketplace")
          ]
        : []),
      ...(asked.has("autoFetch") && result.autoFetch !== false ? [t("wizard.summaryAutoFetch")] : [])
    ]
    return on.length > 0 ? on : [t("wizard.foldNothing")]
  },
  sounds: (result, asked) =>
    HOOK_STEPS.filter(hook => asked.has(hook.step)).map(hook =>
      (result.hooks?.[hook.step] ?? hook.on) ? t(hook.label) : t("wizard.foldOff", { name: t(hook.label) })
    )
}

/** `parts` joined by " · " within `width` columns: the ones that don't fit are counted as "+N", never cut mid-word. */
export function fitParts(parts: string[], width: number): string {
  for (let kept = parts.length; kept > 0; kept--) {
    const dropped = parts.length - kept
    const text = [...parts.slice(0, kept), ...(dropped > 0 ? [`+${dropped}`] : [])].join(" · ")
    if (Bun.stringWidth(text) <= width) return text
  }
  return parts.length > 0 ? `+${parts.length}` : ""
}

/**
 * Where the wizard is: the mascot, then each block, done ones ticked and the open one with its question count, and
 * "Esc back" at the right. What doesn't fit goes, "Esc back" first and then the mascot.
 */
function Progress({ blocks, current, at, of }: Readonly<{ blocks: Block[]; current?: Block; at: number; of: number }>) {
  const { success, accent } = useKajaTheme()
  const reached = current ? blocks.indexOf(current) : blocks.length
  // Smiles once every block is done
  const mascot = current ? "༼☉ω⊙༽🪄" : "༼^ω^༽🪄"
  const count = t("wizard.progressCount", { at, of })
  const crumbs = blocks
    .map(
      (block, index) =>
        (index < reached ? "✓ " : "") + t(BLOCK_LABEL_KEY[block]) + (index === reached ? ` ${count}` : "")
    )
    .join(" › ")
  const esc = `Esc ${t("wizard.back")}`
  const room = textWidth() + 1
  const withMascot = Bun.stringWidth(`${mascot} ${crumbs}`)
  const showEsc = current !== undefined && withMascot + 2 + Bun.stringWidth(esc) <= room
  const showMascot = withMascot <= room
  return (
    <Box paddingLeft={1} width={room + 1} justifyContent="space-between">
      <Text wrap="truncate-end">
        {showMascot ? `${mascot} ` : ""}
        {blocks.map((block, index) => (
          <Text key={block}>
            {index > 0 ? <Text dimColor> › </Text> : null}
            {index < reached ? (
              <Text>
                <Text {...success()}>✓</Text> {t(BLOCK_LABEL_KEY[block])}
              </Text>
            ) : null}
            {index === reached ? (
              <Text>
                <Text bold {...accent()}>
                  {t(BLOCK_LABEL_KEY[block])}
                </Text>{" "}
                <Text dimColor>{count}</Text>
              </Text>
            ) : null}
            {index > reached ? <Text dimColor>{t(BLOCK_LABEL_KEY[block])}</Text> : null}
          </Text>
        ))}
      </Text>
      {showEsc ? (
        <Text>
          Esc <Text dimColor>{t("wizard.back")}</Text>
        </Text>
      ) : null}
    </Box>
  )
}

/** A model id as the list shows it: Fireworks' "accounts/<org>/models/" prefix says nothing the provider column doesn't. */
function modelLabel(model: string): string {
  return model.replace(/^accounts\/[^/]+\/models\//, "")
}

/** The keys of a list you pick one from, then `note`. */
function pickHint(note?: string) {
  return (
    <KeyHint
      keys={[
        ["↑↓", t("hint.move")],
        ["Enter", t("hint.pick")]
      ]}
      note={note}
    />
  )
}

/** The keys of a checklist, then `note`. */
function tickHint(note?: string) {
  return (
    <KeyHint
      keys={[
        ["Space", t("hint.tick")],
        ["Enter", t("hint.continue")]
      ]}
      note={note}
    />
  )
}

/** How many answers the open block shows; older ones are counted on a line above them. */
const OPEN_BLOCK_LINES = 4

/** A finished block folded into one line: "✓", its name to the value column, then its short answers, dim. */
function FoldedBlock({ block, parts }: Readonly<{ block: Block; parts: string[] }>) {
  const { success } = useKajaTheme()
  return (
    <RailLine marker={<Text {...success()}>✓</Text>}>
      <Text wrap="truncate-end">
        {padLabel(t(BLOCK_LABEL_KEY[block]))}
        <Text dimColor>{fitParts(parts, textWidth() - LABEL_WIDTH)}</Text>
      </Text>
    </RailLine>
  )
}

/**
 * The setup wizard, for both the first run (no config yet) and a re-run via `kaja config wizard`. Every step opens on
 * the current value, so holding Enter walks a configured machine through unchanged, and the last answer finishes it
 * with no confirmation. The questions are grouped in blocks; finished ones fold into a line each. Escape goes back one
 * question (on the first it cancels); Backspace/Delete don't, unlike other {@link SelectMenu}s, since a typo-fixing
 * reflex shouldn't throw an answer away. Nothing is written here: the caller applies the collected {@link WizardResult}
 * once `onDone` fires.
 */
export function ConfigWizard({
  prefill,
  mode,
  saved,
  listModels,
  probe,
  hookPrograms,
  gitReady,
  configDir,
  env = process.env,
  onDone,
  onCancel
}: Readonly<{
  prefill?: WizardResult
  /** Mode already forced by `--cloud`/`--local`; the mode step is skipped when set. */
  mode?: KajaMode
  /** Secrets already on disk, so their step offers to keep them instead of demanding a new one. */
  saved?: WizardSaved
  /**
   * The model ids the custom provider's server lists, offered instead of typing one. `key` is the one just typed,
   * if any. Without it, or when the server lists none, model ids are typed.
   */
  listModels?: (baseUrl: string, provider: string, key?: string) => Promise<string[]>
  /** Tests a typed answer once typing pauses; the wizard does no I/O itself. Without it, nothing is tested live. */
  probe?: (target: ProbeTarget, signal: AbortSignal) => Promise<LiveCheck | undefined>
  /** The sound player, notifier and speech program found here; each one found is asked about. */
  hookPrograms?: HookPrograms
  /** Git works here, so the marketplace can be fetched: only then is it asked about. */
  gitReady?: boolean
  /** Where the answers are saved, as the closing line names it (`~/.config/kaja`). */
  configDir?: string
  /** Where a provider's API key may already be set; the process's environment unless a test passes its own. */
  env?: Record<string, string | undefined>
  onDone: (result: WizardResult) => void
  onCancel: () => void
}>) {
  const initial: WizardResult = { ...prefill, ...(mode ? { mode } : {}) }
  // Language is always first and never skipped: every question after it is only answerable by
  // someone who can read it.
  const [step, setStep] = useState<Step>("language")
  const [result, setResult] = useState<WizardResult>(initial)
  // The steps answered so far, in order: the trail is drawn from them, and Esc steps back through them
  const [history, setHistory] = useState<Step[]>([])
  // Set when Enter was pressed on a checklist missing what it needs: no provider, or no chat task.
  const [refused, setRefused] = useState(false)
  // The theme the wizard is drawn in: follows the highlight on the theme step, so moving it recolours everything at once
  const [preview, setPreview] = useState<ThemeName>(initial.theme ?? "dark")
  // The custom server's model ids, per address; `ids` is unset while it is being asked
  const [listing, setListing] = useState<{ url: string; ids?: string[] }>()
  // The user chose to type a model id rather than pick a listed one
  const [typing, setTyping] = useState(false)
  // Rows a long list shows: set each render from the terminal's height, before the step is drawn
  let listRows = 8

  // Asks the custom server for its models once its address and key are in, on the first model step
  const probeUrl = step.startsWith("custom-model") ? result.custom?.baseUrl : undefined
  const probedUrl = useRef<string>(undefined)
  useEffect(() => {
    if (!probeUrl || !listModels || probedUrl.current === probeUrl) return
    probedUrl.current = probeUrl
    setListing({ url: probeUrl })
    const name = result.custom?.name ?? ""
    void listModels(probeUrl, name, result.keys?.[name] || undefined).then(ids => {
      if (probedUrl.current === probeUrl) setListing({ url: probeUrl, ids })
    })
  }, [probeUrl, listModels, result.custom?.name, result.keys])

  // The last answer finishes it: every answer is already on screen, and there's no step to go back to.
  const finished = useRef(false)
  useEffect(() => {
    if (step !== "done" || finished.current) return
    finished.current = true
    onDone(result)
  }, [step, result, onDone])

  function advance(patch: Partial<WizardResult>) {
    const next = { ...result, ...patch }
    setHistory(list => [...list, step])
    setResult(next)
    setTyping(false)
    setStep(nextStepAfter(step, next, mode, hookPrograms, gitReady))
  }

  // Esc: the previous question opens again on its answer; on the first one it cancels the wizard.
  function back() {
    const previous = history.at(-1)
    if (!previous) return onCancel()
    setHistory(list => list.slice(0, -1))
    setTyping(false)
    setRefused(false)
    // The step that ended the custom model list is asked again, so the list isn't finished any more.
    if (previous.startsWith("custom-model")) {
      setResult(current =>
        current.custom?.done ? { ...current, custom: { ...current.custom, done: false } } : current
      )
    }
    setStep(previous)
  }

  /**
   * A key step for a provider whose key is already in one of `envNames`: use it from there, copy it into secrets.toml,
   * or type another. Undefined when none of them is set, or the user chose to type.
   */
  function envKeyView(id: string, name: string, envNames: string[]) {
    const envName = envNames.find(candidate => env[candidate])
    if (!envName || typing) return undefined
    const choices = [
      t("wizard.keyFromEnv", { env: envName }),
      t("wizard.keyCopyEnv", { env: envName }),
      t("wizard.keyTypeOther")
    ]
    let current = 0
    if (result.keys?.[id]) current = result.keys[id] === env[envName] ? 1 : 2
    return (
      <Question
        title={t("wizard.keyEnvTitle", { provider: name, env: envName })}
        hint={pickHint(t("wizard.keyEnvHint"))}
      >
        <SelectMenu
          closeOnBackspace={false}
          items={choices}
          width={70}
          initialIndex={current}
          onSelect={choice => {
            if (choice === 2) return setTyping(true)
            if (choice === 0)
              return advance({ keyEnv: { ...result.keyEnv, [id]: envName }, keys: without(result.keys, id) })
            advance({ keys: { ...result.keys, [id]: env[envName]! }, keyEnv: without(result.keyEnv, id) })
          }}
          onClose={back}
        />
      </Question>
    )
  }

  // A yes/no question, "yes" first, opening on the current answer
  function yesNo({
    title,
    items,
    hint = "",
    on,
    onPick
  }: {
    title: string
    items: [string, string]
    hint?: string
    on: boolean
    onPick: (on: boolean) => void
  }) {
    return (
      <Question title={title} hint={pickHint()}>
        <SelectMenu
          closeOnBackspace={false}
          items={items}
          hints={[hint, ""]}
          width={70}
          initialIndex={on ? 0 : 1}
          onSelect={index => onPick(index === 0)}
          onClose={back}
        />
      </Question>
    )
  }

  // The `check` an InputPrompt gets for `target`, or none without a probe
  function checkWith(target: (value: string) => ProbeTarget) {
    return probe ? (value: string, signal: AbortSignal) => probe(target(value), signal) : undefined
  }

  function stepView() {
    const [kind, subject] = step.split(":") as [string, string | undefined]
    return providerStepView(kind, subject) ?? customStepView(kind, subject) ?? fixedStepView()
  }

  // A catalog provider's key and address, and the model picked for a task.
  function providerStepView(kind: string, subject: string | undefined) {
    const provider = subject ? catalogProvider(subject) : undefined

    if (kind === "key" && provider) {
      const fromEnv = envKeyView(provider.id, provider.name, provider.env ?? [])
      if (fromEnv) return fromEnv
      return (
        <InputPrompt
          onBack={back}
          secret
          title={t("wizard.providerKeyTitle", { provider: provider.name })}
          hint={keyHint()}
          placeholder={keyPlaceholder(
            result.keys?.[provider.id],
            saved?.providers?.includes(provider.id),
            saved?.tails?.[provider.id]
          )}
          check={checkWith(key => ({ kind: "key", baseUrl: result.addresses?.[provider.id] ?? provider.baseUrl, key }))}
          onSubmit={value =>
            advance({
              keys: { ...result.keys, [provider.id]: value || result.keys?.[provider.id] || "" },
              keyEnv: without(result.keyEnv, provider.id)
            })
          }
        />
      )
    }

    if (kind === "address" && provider) {
      return (
        <InputPrompt
          onBack={back}
          title={t("wizard.baseUrlTitle", { provider: provider.name })}
          hint={<KeyHint keys={[["Enter", t("hint.save")]]} note={t("wizard.baseUrlHint")} />}
          defaultValue={result.addresses?.[provider.id] ?? provider.baseUrl}
          check={checkWith(baseUrl => ({ kind: "address", baseUrl }))}
          onSubmit={value => advance({ addresses: { ...result.addresses, [provider.id]: value || provider.baseUrl } })}
        />
      )
    }

    if (kind === "model") {
      const task = subject as ModelTask
      const candidates = candidatesByTask(chosenProviders(result))[task] ?? []
      // Opens on the model in use, else the best guess (vision guesses the chat pick when it can see)
      const guess = chosenPicks(result)[task]
      const current = candidates.findIndex(c => c.provider === guess?.provider && c.model === guess.model)
      // The row it opens on says why: the model already in use, or the best guess
      const openTag = t(result.models?.[task] ? "wizard.modelInUse" : "wizard.modelBestGuess")
      return (
        <Question
          title={t("wizard.modelTitle", { task: t(TASK_LABEL_KEY[task]) })}
          hint={pickHint(t("wizard.modelHint"))}
        >
          <SelectMenu
            closeOnBackspace={false}
            filterable
            visibleCount={listRows}
            items={candidates.map(candidate => modelLabel(candidate.model))}
            columns={candidates.map(candidate => [
              providerName(candidate.provider, result),
              candidate.released?.slice(0, 7) ?? ""
            ])}
            tags={candidates.map((_, index) => (index === Math.max(current, 0) ? openTag : undefined))}
            width={70}
            initialIndex={Math.max(current, 0)}
            onSelect={index => {
              const chosen = candidates[index]!
              advance({ models: { ...result.models, [task]: { provider: chosen.provider, model: chosen.model } } })
            }}
            onClose={back}
          />
        </Question>
      )
    }

    return undefined
  }

  // The custom OpenAI-compatible provider: its name, address, key, and each model with its task.
  function customStepView(kind: string, subject: string | undefined) {
    const custom = result.custom ?? { models: [] }
    const nameOf = custom.name ?? ""

    if (step === "custom-name") {
      return (
        <InputPrompt
          onBack={back}
          title={t("wizard.customNameTitle")}
          hint={<KeyHint keys={[["Enter", t("hint.save")]]} note={t("wizard.customNameHint")} />}
          defaultValue={custom.name}
          validate={value => (customId(value) ? undefined : t("wizard.customNameInvalid"))}
          onSubmit={value => advance({ custom: { ...custom, name: customId(value) } })}
        />
      )
    }

    if (step === "custom-url") {
      return (
        <InputPrompt
          onBack={back}
          title={t("wizard.customUrlTitle")}
          hint={<KeyHint keys={[["Enter", t("hint.save")]]} note={t("wizard.customUrlHint")} />}
          defaultValue={custom.baseUrl}
          validate={value => (isWebAddress(value) ? undefined : t("wizard.customUrlInvalid"))}
          check={checkWith(baseUrl => ({ kind: "address", baseUrl }))}
          onSubmit={value => advance({ custom: { ...custom, baseUrl: value } })}
        />
      )
    }

    if (step === "custom-key") {
      const fromEnv = envKeyView(nameOf, nameOf, [envGuess(nameOf)])
      if (fromEnv) return fromEnv
      return (
        <InputPrompt
          onBack={back}
          secret
          title={t("wizard.providerKeyTitle", { provider: nameOf })}
          hint={keyHint()}
          placeholder={keyPlaceholder(
            result.keys?.[nameOf],
            saved?.providers?.includes(nameOf),
            saved?.tails?.[nameOf]
          )}
          check={checkWith(key => ({ kind: "key", baseUrl: custom.baseUrl ?? "", key }))}
          onSubmit={value =>
            advance({
              keys: { ...result.keys, [nameOf]: value || result.keys?.[nameOf] || "" },
              keyEnv: without(result.keyEnv, nameOf)
            })
          }
        />
      )
    }

    if (step === "custom-review") {
      const ADD = "add"
      return (
        <Question
          title={t("wizard.customReviewTitle", { provider: nameOf })}
          hint={tickHint(t("wizard.customReviewHint"))}
        >
          <CheckMenu
            filterable
            visibleCount={listRows}
            options={[
              ...custom.models.map((entry, index) => ({
                label: entry.task ? `${entry.model} (${t(TASK_LABEL_KEY[entry.task])})` : entry.model,
                value: String(index)
              })),
              { label: t("wizard.customAddModel"), value: ADD }
            ]}
            defaultValue={custom.models.map((_, index) => String(index))}
            onSubmit={values => {
              const models = custom.models.filter((_, index) => values.includes(String(index)))
              advance({ custom: { ...custom, models, reviewed: models.length, done: !values.includes(ADD) } })
            }}
            onClose={back}
          />
        </Question>
      )
    }

    if (kind === "custom-model") {
      const index = Number(subject)
      // A model the wizard is re-offering opens on its id; one past the end is a new one, and empty ends the list.
      const existing = custom.models[index]
      const listed = listing?.url === custom.baseUrl ? listing : undefined
      if (!existing && !typing && listed && !listed.ids) {
        return <Text dimColor>{t("wizard.customModelSearching", { url: custom.baseUrl ?? "" })}</Text>
      }
      const offered = (listed?.ids ?? []).filter(id => !custom.models.some(entry => entry.model === id))
      if (!existing && !typing && offered.length > 0) {
        // Typing and finishing first, so they stay in reach above a long list
        const actions = [t("wizard.customModelTypeOther"), ...(index > 0 ? [t("wizard.customModelEnough")] : [])]
        return (
          <Question
            title={t(index === 0 ? "wizard.customModelPickTitle" : "wizard.customModelPickMoreTitle", {
              provider: nameOf
            })}
            hint={pickHint()}
          >
            <SelectMenu
              closeOnBackspace={false}
              items={[...actions, ...offered]}
              width={70}
              initialIndex={actions.length}
              onSelect={choice => {
                if (choice === 0) return setTyping(true)
                if (choice < actions.length) return advance({ custom: { ...custom, done: true } })
                advance({
                  custom: { ...custom, models: [...custom.models, { model: offered[choice - actions.length]! }] }
                })
              }}
              onClose={back}
            />
          </Question>
        )
      }
      return (
        <InputPrompt
          onBack={back}
          title={t(index === 0 || existing ? "wizard.customModelTitle" : "wizard.customModelMoreTitle", {
            provider: nameOf
          })}
          hint={<KeyHint keys={[["Enter", t("hint.save")]]} note={t("wizard.customModelHint")} />}
          defaultValue={existing?.model}
          // The first model is required, or the provider would serve nothing.
          validate={value => (!existing && index === 0 && !value ? t("wizard.customModelRequired") : undefined)}
          onSubmit={value => {
            if (existing) {
              const models = custom.models.map((m, i) => (i === index && value ? { ...m, model: value } : m))
              return advance({ custom: { ...custom, models } })
            }
            advance({
              custom: value ? { ...custom, models: [...custom.models, { model: value }] } : { ...custom, done: true }
            })
          }}
        />
      )
    }

    if (kind === "custom-task") {
      const index = Number(subject)
      const entry = custom.models[index]
      return (
        <Question title={t("wizard.customTaskTitle", { model: entry?.model ?? "" })} hint={pickHint()}>
          <SelectMenu
            closeOnBackspace={false}
            items={TASK_ORDER.map(task => t(TASK_LABEL_KEY[task]))}
            width={70}
            initialIndex={entry?.task ? TASK_ORDER.indexOf(entry.task) : undefined}
            onSelect={choice =>
              advance({
                custom: {
                  ...custom,
                  models: custom.models.map((m, i) => (i === index ? { ...m, task: TASK_ORDER[choice]! } : m))
                }
              })
            }
            onClose={back}
          />
        </Question>
      )
    }

    return undefined
  }

  // The steps asked once: language, theme, mode, providers, extras and the Telegram token.
  function fixedStepView() {
    switch (step) {
      case "mode": {
        return (
          <Question title={t("wizard.modeTitle")} hint={pickHint()}>
            <SelectMenu
              closeOnBackspace={false}
              items={[t("wizard.modeCloud"), t("wizard.modeLocal")]}
              width={70}
              initialIndex={Math.max(0, MODE_CHOICES.indexOf(result.mode ?? "cloud"))}
              onSelect={index => advance({ mode: MODE_CHOICES[index] })}
              onClose={back}
            />
          </Question>
        )
      }

      case "language": {
        return (
          <Question title={t("wizard.languageTitle")} hint={pickHint()}>
            <SelectMenu
              closeOnBackspace={false}
              items={locales.map(locale => LOCALE_LABELS[locale])}
              // The code beside the native name, so a language you can't read is still identifiable.
              hints={[...locales]}
              initialIndex={result.language ? locales.indexOf(result.language) : undefined}
              onSelect={index => {
                const language = locales[index]!
                // Switching the process language here is the whole point of asking first: every step
                // after this one renders through `t()`. The caller still saves it to preferences.locale.
                setLanguage(language)
                advance({ language })
              }}
              onClose={back}
            />
          </Question>
        )
      }

      case "theme": {
        return (
          <Question title={t("wizard.themeTitle")} hint={pickHint(t("wizard.themeHint"))}>
            <SelectMenu
              closeOnBackspace={false}
              items={THEME_CHOICES.map(choice => t(THEME_LABEL_KEY[choice]))}
              width={70}
              initialIndex={THEME_CHOICES.indexOf(result.theme ?? "dark")}
              // The highlighted row in that theme's own colours, and the whole wizard with it
              preview
              onFocus={index => setPreview(THEME_CHOICES[index]!)}
              onSelect={index => advance({ theme: THEME_CHOICES[index] })}
              onClose={back}
            />
          </Question>
        )
      }

      case "providers": {
        // Servers running here and what you already use or have a key for, the well-known ones, then the rest by name
        const envKey = (provider: CatalogProvider) => provider.env?.find(name => env[name])
        const inUse = (provider: CatalogProvider) => Boolean(result.providers?.includes(provider.id))
        // A catalog entry for a server found running here (LM Studio) gives way to the server's own model list
        const local = result.local ?? []
        const sameServer = (provider: CatalogProvider) =>
          local.some(server => sameAddress(server.baseUrl, provider.baseUrl))
        const listed = CATALOG.filter(provider => !sameServer(provider))
        const groups = providerGroups(listed, provider => inUse(provider) || Boolean(envKey(provider)))
        const kind = (provider: CatalogProvider) =>
          t(provider.kind === "hosted" ? "wizard.kindCloud" : "wizard.kindLocal")
        const row = (provider: CatalogProvider, group: string, reason?: string) => ({
          label: provider.name,
          value: provider.id,
          group,
          detail: [kind(provider), ...(reason ? [reason] : [])]
        })
        const foundGroup = t("wizard.groupFound")
        const restGroup = t("wizard.groupRest")
        return (
          <Question
            title={t("wizard.providerTitle")}
            hint={refused ? <Problem>{t("wizard.providerRequired")}</Problem> : tickHint()}
          >
            {/* A re-run starts with the providers in models.toml ticked; a first run with those whose key is in the environment and the servers running here. */}
            <CheckMenu
              filterable
              enterPicksFocused
              visibleCount={listRows}
              options={[
                ...local.map(server => ({
                  label: server.name,
                  value: server.id,
                  group: foundGroup,
                  detail: [
                    t("wizard.kindLocal"),
                    t("wizard.foundRunning", { address: server.baseUrl.replace(/^https?:\/\//, "") })
                  ]
                })),
                ...groups.found.map(provider => {
                  const variable = envKey(provider)
                  return row(
                    provider,
                    foundGroup,
                    variable ? t("wizard.foundEnv", { env: variable }) : t("wizard.foundInUse")
                  )
                }),
                ...groups.popular.map(provider => row(provider, t("wizard.groupPopular"))),
                {
                  label: t("wizard.providerCustom"),
                  value: CUSTOM,
                  group: restGroup,
                  detail: [t("wizard.providerCustomDetail")]
                },
                ...groups.rest.map(provider => row(provider, restGroup))
              ]}
              defaultValue={
                result.providers ?? [
                  ...local.map(server => server.id),
                  ...listed.filter(envKey).map(provider => provider.id)
                ]
              }
              onSubmit={providers => {
                setRefused(providers.length === 0)
                if (providers.length > 0) advance({ providers })
              }}
              onClose={back}
            />
          </Question>
        )
      }

      case "tasks": {
        const available = availableTasks(result)
        return (
          <Question
            title={t("wizard.tasksTitle")}
            hint={
              refused ? (
                <Problem>{t(available.includes("chat") ? "wizard.tasksChatRequired" : "wizard.tasksNoChat")}</Problem>
              ) : (
                tickHint(t("wizard.tasksHint"))
              )
            }
          >
            <CheckMenu
              options={available.map(task => ({ label: capitalized(t(TASK_LABEL_KEY[task])), value: task }))}
              defaultValue={selectedTasks(result)}
              onSubmit={values => {
                // Local mode can't start without something to chat with
                const missingChat = !values.includes("chat")
                setRefused(missingChat)
                if (!missingChat) advance({ tasks: values as ModelTask[] })
              }}
              onClose={back}
            />
          </Question>
        )
      }

      case "extras": {
        return (
          <Question title={t("wizard.extrasTitle")} hint={tickHint(t("wizard.extrasHint"))}>
            {/* Nothing ticked by default, so one Enter skips the whole step. */}
            <CheckMenu
              options={EXTRA_CHOICES.map(extra => ({ label: t(EXTRA_LABEL_KEY[extra]), value: extra }))}
              defaultValue={result.extras}
              onSubmit={values => advance({ extras: values as WizardExtra[] })}
              onClose={back}
            />
          </Question>
        )
      }

      case "telegramToken": {
        return (
          <InputPrompt
            onBack={back}
            secret
            title={t("wizard.telegramTokenTitle")}
            hint={keyHint()}
            placeholder={keyPlaceholder(result.telegramToken, saved?.telegram, saved?.tails?.telegram)}
            check={checkWith(token => ({ kind: "telegram", token }))}
            onSubmit={value => advance({ telegramToken: value || result.telegramToken || "" })}
          />
        )
      }

      case "marketplace": {
        return yesNo({
          title: t("wizard.marketplaceTitle"),
          items: [t("wizard.marketplaceYes"), t("wizard.marketplaceNo")],
          on: result.marketplace !== false,
          onPick: marketplace => advance({ marketplace })
        })
      }

      case "autoFetch": {
        return yesNo({
          title: t("wizard.autoFetchTitle"),
          items: [t("wizard.autoFetchYes"), t("wizard.autoFetchNo")],
          on: result.autoFetch !== false,
          onPick: autoFetch => advance({ autoFetch })
        })
      }

      case "sounds":
      case "notifications":
      case "speech": {
        const hook = HOOK_STEPS.find(candidate => candidate.step === step)!
        const program = hookPrograms?.[hook.kind] ?? ""
        return yesNo({
          title: t(hook.title, { program }),
          items: [t("hooks.yes"), t("hooks.no")],
          // Speech names its program in the question already
          hint: hook.step === "speech" ? "" : program,
          on: result.hooks?.[hook.step] ?? hook.on,
          onPick: on => advance({ hooks: { ...result.hooks, [hook.step]: on } })
        })
      }

      default:
        // Nothing to draw: the answers are on screen, and the setup carries on below once onDone fires.
        return null
    }
  }

  const { success } = useKajaTheme()
  const steps = stepsFor(result, mode, hookPrograms, gitReady)
  const blocks = BLOCK_ORDER.filter(block => steps.some(candidate => blockOf(candidate) === block))
  const current = blockOf(step)
  const inBlock = steps.filter(candidate => blockOf(candidate) === current)
  // The open step is missing from the list only while it ends the custom model list: it's then that list's last one.
  const at = Math.max(inBlock.indexOf(step), 0) + 1
  const of = Math.max(inBlock.length, at)
  // Each answered step's line, latest answers shown, so going back and changing one updates it
  const trail = history.flatMap(answeredStep => {
    const line = answerLine(answeredStep, result, saved)
    const block = blockOf(answeredStep)
    return line && block ? [{ id: answeredStep, block, ...line }] : []
  })
  const asked = new Set(history.map(answeredStep => answeredStep.split(":")[0]!))
  const recent = trail.filter(line => line.block === current)
  // The latest few only: a frame taller than the terminal can't be redrawn in place
  const hidden = Math.max(0, recent.length - OPEN_BLOCK_LINES)
  const folded = blocks.filter(block => block !== current && trail.some(line => line.block === block))
  // A list gets what the terminal has left after everything else on screen, 5 to 10 rows
  const around = 1 + folded.length + Math.min(recent.length, OPEN_BLOCK_LINES) + (hidden > 0 ? 1 : 0) + 10
  listRows = Math.min(10, Math.max(5, (process.stdout.rows || 24) - around))

  return (
    <ThemeProvider theme={themeFor(preview)}>
      <Box flexDirection="column">
        <Progress blocks={blocks} current={current} at={at} of={of} />
        {blocks.map(block =>
          folded.includes(block) ? (
            <FoldedBlock key={block} block={block} parts={FOLDS[block](result, asked, saved)} />
          ) : null
        )}
        {hidden > 0 ? (
          <RailLine marker={<Text dimColor>⋮</Text>}>
            <Text dimColor>{t("wizard.moreAnswers", { count: hidden })}</Text>
          </RailLine>
        ) : null}
        {recent.slice(hidden).map(line => (
          <RecentAnswer key={line.id} label={line.label} value={line.value} />
        ))}
        {/* The last frame closes the record of what was chosen; the runner's Finishing up follows below it */}
        {current ? null : (
          <RailLine marker={<Text {...success()}>✓</Text>}>
            <Text>
              <Text bold>{t("wizard.allSet")}</Text>
              {configDir ? <Text dimColor> {t("wizard.savedTo", { path: configDir })}</Text> : null}
            </Text>
          </RailLine>
        )}
        {/* The rail runs from the recent answers into the question */}
        {recent.length > 0 && current ? (
          <RailLine marker={<Text dimColor>│</Text>}>
            <Text> </Text>
          </RailLine>
        ) : null}
        {/* Keyed by step: two questions of one kind in a row (two addresses, two keys) must not share an input's state. */}
        <Box key={step} flexDirection="column">
          {stepView()}
        </Box>
      </Box>
    </ThemeProvider>
  )
}
