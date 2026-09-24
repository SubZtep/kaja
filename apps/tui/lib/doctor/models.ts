import { resolveContextWindow } from "@kaja/nasi"
import type { CliResolvedModel, ModelTask } from "@kaja/schema/config"
import { t } from "../i18n"
import { probeModel } from "../models/check"
import { loadModelsFile, saveTaskModel } from "../models/models"
import { statusLine } from "./status"

const TASK_ORDER: ModelTask[] = ["chat", "summarize", "embedding", "rerank", "tts", "stt", "image-generation"]

/** The heading each task's models are listed under. */
const TASK_HEADING_KEY: Record<ModelTask, string> = {
  chat: "doctor.taskChat",
  tts: "doctor.taskTts",
  stt: "doctor.taskStt",
  embedding: "doctor.taskEmbedding",
  rerank: "doctor.taskRerank",
  "image-generation": "doctor.taskImageGen",
  summarize: "doctor.taskSummarize"
}

/** The task as a noun inside a sentence, e.g. "Use another chat model?". */
const TASK_NOUN_KEY: Record<ModelTask, string> = {
  chat: "wizard.taskChat",
  tts: "wizard.taskTts",
  stt: "wizard.taskStt",
  embedding: "wizard.taskEmbedding",
  rerank: "wizard.taskRerank",
  "image-generation": "wizard.taskImageGeneration",
  summarize: "wizard.taskSummarize"
}

/** The models grouped by task, in the order the report lists them. */
export function groupModelsByTask(models: CliResolvedModel[]): [ModelTask, CliResolvedModel[]][] {
  const grouped = new Map<ModelTask, CliResolvedModel[]>()
  for (const model of models) grouped.set(model.task, [...(grouped.get(model.task) ?? []), model])
  return [...grouped.entries()].sort(([a], [b]) => TASK_ORDER.indexOf(a) - TASK_ORDER.indexOf(b))
}

/** How the model pass talks to the user; the doctor passes an Ink prompt, tests pass a fake. */
export type ModelIo = {
  interactive: boolean
  /** Resolves to the index of the chosen item, or undefined when dismissed. Item 0 is always "keep it as it is". */
  askPick: (title: string, items: string[]) => Promise<number | undefined>
}

/** What became of a task's active model: still fine, still broken, or replaced by another that answered. */
export type ModelOutcome = {
  task: ModelTask
  /** The model [tasks] names, the one the app uses. */
  active: CliResolvedModel
  ok: boolean
  switchedTo?: CliResolvedModel
}

type Deps = {
  probe?: typeof probeModel
  save?: typeof saveTaskModel
  contextWindow?: typeof resolveContextWindow
  /** models.toml's [tasks]: the model id each task uses. */
  active?: () => Promise<Partial<Record<ModelTask, string>>>
}

/** The model pass's prompt for a real terminal. Loaded here so a non-interactive caller never loads the prompts. */
export async function defaultModelIo(): Promise<ModelIo> {
  const { askPick } = await import("./prompt")
  return { interactive: Boolean(process.stdin.isTTY), askPick }
}

type ProbeResult = { model: CliResolvedModel; result: Awaited<ReturnType<typeof probeModel>> }

// "up", plus a chat model's context window and where that number came from.
async function upLabel(model: CliResolvedModel, contextWindow: typeof resolveContextWindow): Promise<string> {
  if (model.task !== "chat") return t("doctor.modelUp")
  const window = await contextWindow(model)
  return t("doctor.modelUpWindow", {
    tokens: window.tokens.toLocaleString(),
    source: t(`doctor.contextWindow_${window.source}`)
  })
}

// Probes each model of one task, printing a line per model.
async function probeTask(
  entries: CliResolvedModel[],
  print: (line: string) => void,
  probe: typeof probeModel,
  contextWindow: typeof resolveContextWindow
): Promise<ProbeResult[]> {
  const results: ProbeResult[] = []
  for (const model of entries) {
    const result = await probe(model)
    results.push({ model, result })
    print(
      result.ok
        ? statusLine("success", `${model.model} (${await upLabel(model, contextWindow)})`)
        : statusLine("error", `${model.model} (${t("doctor.modelDown")}): ${result.error}`)
    )
  }
  return results
}

// The error without its closing full stops and whitespace, so it reads mid-sentence.
function trimTrailingDots(text: string): string {
  let end = text.length
  while (end > 0 && (text[end - 1] === "." || text[end - 1]!.trim() === "")) end--
  return text.slice(0, end)
}

/**
 * Tests every configured model, task by task, and prints one line each with why it failed. When a
 * task's active model (the one [tasks] names) fails while another model of the same task answered, and
 * there is a terminal to ask in, offers to switch to it: only that task's line in [tasks] changes, so every
 * model entry and any persona pin stay as they are. A model nothing else can stand in for is only reported.
 */
export async function runModelPass(
  models: CliResolvedModel[],
  print: (line: string) => void,
  io: ModelIo,
  {
    probe = probeModel,
    save = saveTaskModel,
    contextWindow = resolveContextWindow,
    active: activeIds = async () => (await loadModelsFile()).tasks
  }: Deps = {}
): Promise<ModelOutcome[]> {
  const outcomes: ModelOutcome[] = []
  const inUse = await activeIds()

  for (const [task, entries] of groupModelsByTask(models)) {
    print(t(TASK_HEADING_KEY[task]))
    const results = await probeTask(entries, print, probe, contextWindow)

    const active = results.find(entry => entry.model.id === inUse[task])
    if (!active) continue
    const outcome: ModelOutcome = { task, active: active.model, ok: active.result.ok }
    outcomes.push(outcome)
    const failure = active.result
    if (failure.ok || !io.interactive) continue

    const working = results.filter(entry => entry !== active && entry.result.ok).map(entry => entry.model)
    const noun = t(TASK_NOUN_KEY[task])
    if (results.length > 1 && working.length === 0) {
      print(statusLine("warning", t("doctor.modelAlternativesDown", { task: noun })))
      continue
    }
    if (working.length === 0) continue

    const picked = await io.askPick(
      t("doctor.modelSwitchTitle", {
        task: noun,
        model: active.model.model,
        reason: trimTrailingDots(failure.error)
      }),
      [
        t("doctor.modelSwitchKeep", { model: active.model.model }),
        ...working.map(model => `${model.provider} — ${model.model}`)
      ]
    )
    if (picked === undefined || picked === 0) continue

    const chosen = working[picked - 1]!
    await save(task, chosen.id)
    outcome.ok = true
    outcome.switchedTo = chosen
    print(
      statusLine("success", t("doctor.modelSwitched", { task: noun, provider: chosen.provider, model: chosen.model }))
    )
  }
  return outcomes
}
