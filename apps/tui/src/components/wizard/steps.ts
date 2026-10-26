import type { ModelTask } from "@kaja/schema/config"
import type { KajaMode } from "../../lib/config/mode"
import type { BackendKind } from "../../lib/hooks/detect"
import type { WantedHooks } from "../../lib/hooks/templates"
import type { Language } from "../../lib/i18n"
import { t } from "../../lib/i18n"
import {
  candidatesByTask,
  CATALOG,
  type CatalogProvider,
  catalogProvider,
  type ModelPick,
  resolvePicks,
  TASK_ORDER
} from "../../lib/models/catalog"
import type { ThemeName } from "../../lib/terminal-background"

/** Optional features, each needing one more answer afterwards. None is ticked by default. */
export type WizardExtra = "telegram"

/** The extras checklist, in the order shown. */
export const EXTRA_CHOICES: WizardExtra[] = ["telegram"]

/** Each extra's checklist label (an i18n key). */
export const EXTRA_LABEL_KEY: Record<WizardExtra, string> = {
  telegram: "wizard.extraTelegram"
}

/** Each extra's short name for answer lines (an i18n key). */
export const EXTRA_SHORT_KEY: Record<WizardExtra, string> = {
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
export const CUSTOM = "custom"

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

/** The Sounds block's questions, one per kind of hook, with what each opens on. */
export const HOOK_STEPS: { step: HookStep; kind: BackendKind; title: string; label: string; on: boolean }[] = [
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
export type Step =
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
export type Block = "basics" | "providers" | "models" | "extras" | "sounds"

/** Every block, in the order asked. */
export const BLOCK_ORDER: Block[] = ["basics", "providers", "models", "extras", "sounds"]

/** Each block's name in the header and its folded line (an i18n key). */
export const BLOCK_LABEL_KEY: Record<Block, string> = {
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

/** The block a step is asked in; `done` has none. */
export function blockOf(step: Step): Block | undefined {
  return BLOCK_OF_KIND[step.split(":")[0]!]
}

/** Each model task's label (an i18n key). */
export const TASK_LABEL_KEY: Record<ModelTask, string> = {
  chat: "wizard.taskChat",
  embedding: "wizard.taskEmbedding",
  rerank: "wizard.taskRerank",
  "image-generation": "wizard.taskImageGeneration",
  tts: "wizard.taskTts",
  stt: "wizard.taskStt",
  summarize: "wizard.taskSummarize",
  vision: "wizard.taskVision"
}

/** The mode step's choices, in the order shown. */
export const MODE_CHOICES: KajaMode[] = ["cloud", "local"]

/** The theme step's choices, in the order shown. */
export const THEME_CHOICES: ThemeName[] = ["dark", "light", "terminal"]

/** Each theme's short name for answer lines (an i18n key). */
export const THEME_SHORT_KEY: Record<ThemeName, string> = {
  dark: "wizard.themeDarkShort",
  light: "wizard.themeLightShort",
  terminal: "wizard.themeTerminalShort"
}

/** Each theme's menu label (an i18n key). */
export const THEME_LABEL_KEY: Record<ThemeName, string> = {
  dark: "wizard.themeDark",
  light: "wizard.themeLight",
  terminal: "wizard.themeTerminal"
}

/** A name reduced to what a TOML table key and a secrets.toml entry can carry; never one the catalog already owns. */
export function customId(name: string): string {
  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  return catalogProvider(id) ? `${id}-custom` : id
}

/** Whether `value` is an http(s) address, the only kind an OpenAI-compatible API can be reached on. */
export function isWebAddress(value: string): boolean {
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
export function catalogChoices(result: WizardResult): CatalogProvider[] {
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
export function availableTasks(result: WizardResult): ModelTask[] {
  const candidates = candidatesByTask(chosenProviders(result))
  return TASK_ORDER.filter(task => candidates[task]?.length)
}

/** The tasks being set up: the ones ticked (the defaults until asked) that some chosen provider can serve. */
export function selectedTasks(result: WizardResult): ModelTask[] {
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
export function stepsFor(
  result: WizardResult,
  forcedMode?: KajaMode,
  programs: HookPrograms = {},
  git = false
): Step[] {
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
  if (tickedProviders(result).includes(CUSTOM)) steps.push(...customSteps(result.custom))
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

// The custom provider's steps: name, address, key, then its models one by one
function customSteps(custom: WizardCustom | undefined): Step[] {
  const steps: Step[] = ["custom-name", "custom-url", "custom-key"]
  const models = custom?.models ?? []
  // A saved provider's models are reviewed in one list; only the ones added after it are asked one by one
  if (custom?.saved) steps.push("custom-review")
  const first = custom?.saved ? (custom.reviewed ?? models.length) : 0
  for (let index = first; index < models.length; index++) {
    steps.push(`custom-model:${index}`, `custom-task:${index}`)
  }
  // Ask for another model until the user ends the list, but never while the last one still needs its task.
  if (!custom?.done && models.at(-1)?.task !== undefined) steps.push(`custom-model:${models.length}`)
  else if (models.length === 0) steps.push("custom-model:0")
  return steps
}

/** The step after `step` for the answers so far, or `done`. */
export function nextStepAfter(
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

/** A provider's display name: the custom one's own, a catalog or local server's, else its id. */
export function providerName(id: string, result?: WizardResult): string {
  const local = result?.local?.find(provider => provider.id === id)
  if (id === CUSTOM) return result?.custom?.name ?? t("wizard.providerCustom")
  return catalogProvider(id)?.name ?? local?.name ?? id
}

/**
 * What happened to a key step: typed, left empty over one already saved, or left empty. Undefined when the step never
 * applied.
 */
export function keyState(typed: string | undefined, alreadySaved: boolean | undefined): string | undefined {
  if (typed === undefined) return undefined
  if (typed) return t("wizard.keyStateEntered")
  return t(alreadySaved ? "wizard.keyStateKept" : "wizard.keyStateSkipped")
}

/** The environment variable a custom provider's key would usually be in, e.g. `MY_BOX_API_KEY`. */
export function envGuess(name: string): string {
  return `${name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`
}

/** Without `id`: the rest of the record, so a key typed and a key read from the environment never both apply */
export function without<T>(record: Record<string, T> | undefined, id: string): Record<string, T> {
  const { [id]: _, ...rest } = record ?? {}
  return rest
}

// The last 4 characters of a key long enough not to give it away, for "Enter keeps the key (…Qx7f)"
const tailOf = (key: string | undefined) => (key && key.length >= 12 ? key.slice(-4) : undefined)

/** A key step's empty field: Enter keeps a key typed earlier (you came back to it) or one already saved, else skips */
export function keyPlaceholder(
  typed: string | undefined,
  alreadySaved: boolean | undefined,
  savedTail?: string
): string {
  const tail = typed ? tailOf(typed) : savedTail
  if (!typed && !alreadySaved) return t("wizard.keySkips")
  const which = typed ? "Typed" : "Saved"
  return tail ? t(`wizard.keyKeeps${which}Tail`, { tail }) : t(`wizard.keyKeeps${which}`)
}
