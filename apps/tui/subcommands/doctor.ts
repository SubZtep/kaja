import type { CliResolvedModel } from "@kaja/schema/config"
import { toolName } from "../lib/agent/agents"
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

/**
 * `kaja doctor` — prints the same configuration/connectivity info the old
 * startup panel used to show in the empty chat viewport, but to the console
 * and on demand, so it doesn't clutter every TUI launch.
 */
export async function runDoctorSubcommand() {
  const { bootstrapLocalAgentDeps } = await import("../lib/cli/headless")
  const { listSessions } = await import("../lib/session/store")
  const { loadMemory } = await import("../lib/memory/store")

  console.log(t("doctor.cwd") + process.cwd())
  console.log()

  const { models, tools, mcpServers, closeTools } = await bootstrapLocalAgentDeps()

  if (models.length === 0) {
    console.log(t("doctor.noModels"))
  } else {
    console.log(t("doctor.checking"))
    const grouped = models.reduce<Map<CliResolvedModel["task"], CliResolvedModel[]>>((acc, model) => {
      const list = acc.get(model.task) ?? []
      list.push(model)
      acc.set(model.task, list)
      return acc
    }, new Map())

    for (const [task, entries] of [...grouped.entries()].sort(
      ([a], [b]) => TASK_ORDER.indexOf(a) - TASK_ORDER.indexOf(b)
    )) {
      console.log(t(TASK_LABEL_KEY[task]))
      for (const model of entries) {
        const available = await checkModelAvailability(model)
        console.log(
          `  ${available ? "✓" : "✗"} ${model.model} (${t(available ? "doctor.modelUp" : "doctor.modelDown")})`
        )
      }
    }
  }
  console.log()

  if (mcpServers.length > 0) {
    console.log(t("doctor.mcpServers"))
    for (const server of mcpServers) {
      const status = server.failed
        ? t("doctor.mcpServerFailed")
        : t("doctor.mcpServerToolCount", { count: server.toolCount })
      console.log(`  ${server.failed ? "✗" : "✓"} ${server.id} ${status}`)
    }
    console.log()
  }

  if (tools.length > 0) {
    console.log(t("doctor.tools"))
    for (const tool of tools) console.log(`  ${toolName(tool)}`)
    console.log()
  }

  const sessionCount = (await listSessions()).length
  const memoryNoteCount = Object.keys(await loadMemory()).length
  console.log(t("doctor.stats", { sessionCount, memoryNoteCount }))

  await closeTools()
  process.exit(0)
}
