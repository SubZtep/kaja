import type { SkippedTool, ToolOrigin } from "@kaja/nasi"
import type { CliResolvedModel } from "@kaja/schema/config"
import { LOCAL_OWNER } from "@kaja/schema/store"
import { type Tool, toolName } from "../lib/agent/agents"
import { t } from "../lib/i18n"
import { checkModelAvailability } from "../lib/models/check"

const TASK_ORDER: CliResolvedModel["task"][] = ["chat", "embedding", "rerank", "tts", "stt", "image-generation"]

const TASK_LABEL_KEY: Record<CliResolvedModel["task"], string> = {
  chat: "doctor.taskChat",
  tts: "doctor.taskTts",
  stt: "doctor.taskStt",
  embedding: "doctor.taskEmbedding",
  rerank: "doctor.taskRerank",
  "image-generation": "doctor.taskImageGen"
}

function groupModelsByTask(models: CliResolvedModel[]): [CliResolvedModel["task"], CliResolvedModel[]][] {
  const grouped = models.reduce<Map<CliResolvedModel["task"], CliResolvedModel[]>>((acc, model) => {
    const list = acc.get(model.task) ?? []
    list.push(model)
    acc.set(model.task, list)
    return acc
  }, new Map())

  return [...grouped.entries()].sort(([a], [b]) => TASK_ORDER.indexOf(a) - TASK_ORDER.indexOf(b))
}

async function printModelStatus(model: CliResolvedModel) {
  const available = await checkModelAvailability(model)
  console.log(`  ${available ? "✓" : "✗"} ${model.model} (${t(available ? "doctor.modelUp" : "doctor.modelDown")})`)
}

async function printModels(models: CliResolvedModel[]) {
  if (models.length === 0) {
    console.log(t("doctor.noModels"))
    return
  }

  console.log(t("doctor.checking"))
  for (const [task, entries] of groupModelsByTask(models)) {
    console.log(t(TASK_LABEL_KEY[task]))
    for (const model of entries) await printModelStatus(model)
  }
}

function printMcpServers(mcpServers: { id: string; failed: boolean; toolCount: number }[]) {
  if (mcpServers.length === 0) return

  console.log(t("doctor.mcpServers"))
  for (const server of mcpServers) {
    const status = server.failed
      ? t("doctor.mcpServerFailed")
      : t("doctor.mcpServerToolCount", { count: server.toolCount })
    console.log(`  ${server.failed ? "✗" : "✓"} ${server.id} ${status}`)
  }
  console.log()
}

const ORIGIN_LABEL_KEY: Record<ToolOrigin, string> = {
  official: "doctor.toolsOfficial",
  community: "doctor.toolsCommunity",
  "third-party": "doctor.toolsThirdParty"
}

// " [source]" after a tool name, or nothing for a tool without one.
const sourceTag = (source: string | undefined) => (source ? ` [${source}]` : "")

/** Names grouped by source, e.g. "click, fill [mcp:chrome-devtools]"; official tools have no source so they stay one plain list. */
function namesBySource(tools: Tool<any>[]): string {
  const bySource = new Map<string, string[]>()
  for (const t of tools) {
    const names = bySource.get(t.source ?? "") ?? []
    names.push(toolName(t))
    bySource.set(t.source ?? "", names)
  }
  return [...bySource.entries()].map(([source, names]) => `${names.join(", ")}${sourceTag(source)}`).join("; ")
}

function skippedLine(skip: SkippedTool): string {
  const reason =
    skip.reason === "reserved" ? t("doctor.skippedReserved") : t("doctor.skippedTaken", { source: skip.takenBy ?? "?" })
  return `${skip.name}${sourceTag(skip.source)}: ${reason}`
}

/** The Tools section of `kaja doctor`: one line per origin that has tools, then anything left out and why. */
export function toolReportLines(tools: Tool<any>[], skipped: SkippedTool[]): string[] {
  if (tools.length === 0 && skipped.length === 0) return []
  const lines = [t("doctor.tools")]
  for (const origin of ["official", "community", "third-party"] as const) {
    const group = tools.filter(tool => (tool.origin ?? "official") === origin)
    if (group.length > 0) lines.push(`  ${t(ORIGIN_LABEL_KEY[origin])}: ${namesBySource(group)}`)
  }
  if (skipped.length > 0) {
    lines.push(`  ${t("doctor.toolsSkipped")}:`)
    for (const skip of skipped) lines.push(`    ${skippedLine(skip)}`)
  }
  return lines
}

/**
 * The keys-and-tokens pass: tests every credential the config relies on and, in a
 * terminal, asks for anything missing or failing (tested before it's saved). Runs
 * before the rest of the report so the model and tool checks see the fixes.
 */
async function checkCredentials() {
  const { runCredentialPass } = await import("../lib/doctor/credentials")
  const outcomes = await runCredentialPass(line => console.log(line), t("doctor.credentials"))
  if (outcomes.length > 0) console.log()
  return outcomes
}

/**
 * `kaja doctor` — checks keys and tokens (asking for missing ones in a terminal),
 * then prints the configuration/connectivity info the old startup panel used to
 * show, and ends with what's still left to fix.
 */
export async function runDoctorSubcommand() {
  const { bootstrapLocalAgentDeps } = await import("../lib/cli/headless")
  const { listSessions } = await import("../lib/session/store")
  const { loadMemory } = await import("../lib/memory/store")
  const { summaryLines } = await import("../lib/doctor/credentials")
  const { getSecretsPath } = await import("../lib/config/secrets")

  console.log(t("doctor.cwd") + process.cwd())
  console.log()

  const outcomes = await checkCredentials()

  const { models, tools, skipped, mcpServers, closeTools } = await bootstrapLocalAgentDeps()

  await printModels(models)
  console.log()

  printMcpServers(mcpServers)

  const toolLines = toolReportLines(tools, skipped)
  if (toolLines.length > 0) {
    for (const line of toolLines) console.log(line)
    console.log()
  }

  const sessionCount = (await listSessions()).length
  const memoryNoteCount = Object.keys(await loadMemory(LOCAL_OWNER)).length
  console.log(t("doctor.stats", { sessionCount, memoryNoteCount }))
  console.log()
  for (const line of summaryLines(outcomes, getSecretsPath())) console.log(line)

  await closeTools()
  process.exit(0)
}
