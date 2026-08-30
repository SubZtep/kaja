import { isConfigExists as configExists, getConfigPath, readConfigLoose } from "../config/config"
import { getServicesPath, readServicesLoose } from "../config/services"
import { t } from "../i18n"
import {
  forgetNotes,
  listAllDatasetAnswers,
  listDatasetVersionsSummary,
  loadMemory,
  resolveMemoryDbPath,
  saveMemory
} from "../memory/store"
import { loadModels } from "../models/models"
import { loadDatasets } from "../personas/datasets"
import { loadPersonas } from "../personas/personas"
import { deleteSessionRow, listSessions, loadSessionRow } from "../session/store"
import {
  configPage,
  type DatasetVersionSummary,
  datasetsPage,
  notesPage,
  notFoundPage,
  personasPage,
  sessionPage,
  sessionsPage,
  unconfiguredPersonasPage
} from "./pages"

/**
 * The `kaja web` subcommand: a localhost-only webserver for viewing the
 * config (secrets masked) and browsing/pruning memory.sqlite. Like
 * lib/memory-cli.ts and lib/session-cli.ts it's dispatched (from cli.tsx)
 * before the config guard and built only on the stores plus
 * readConfigLoose — inspecting a broken setup is precisely when this UI is
 * most useful, so it must work without a valid LLM config.
 */

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" }
  })
}

function seeOther(location: string): Response {
  return new Response(null, { status: 303, headers: { location } })
}

/**
 * Exported seam for tests (pass port 0 for an ephemeral one). Bound to
 * 127.0.0.1 on purpose: the pages expose memory contents and delete
 * actions, so the server must never listen on a public interface.
 */
export function startWebServer(port: number) {
  return Bun.serve({
    port,
    hostname: "127.0.0.1",
    routes: {
      "/": async () => {
        const [config, services, store, sessions, answers, versions, dbPath] = await Promise.all([
          readConfigLoose(),
          readServicesLoose(),
          loadMemory(),
          listSessions(),
          listAllDatasetAnswers(),
          listDatasetVersionsSummary(),
          resolveMemoryDbPath()
        ])
        return html(
          configPage({
            config,
            configPath: getConfigPath(),
            services,
            servicesPath: getServicesPath(),
            dbPath,
            counts: {
              notes: Object.keys(store).length,
              sessions: sessions.length,
              dataset_answers: answers.length,
              dataset_versions: versions.length
            }
          })
        )
      },
      "/personas": async () => {
        // lib/agents.ts pulls in lib/openai.ts, which reads the LLM config at module load and exits the process if it's missing/invalid — fine for the normal boot path (cli.tsx only imports it after its own config guard), fatal here since this whole server exists to stay usable on a broken config. Import it dynamically, and only once we know the file is there.
        if (!(await configExists())) {
          return html(unconfiguredPersonasPage())
        }
        // @kaja/nasi's memory/dataset-info tools need setActiveStorePath() called before use (throws "nasi store is not open" otherwise) — loadMemory() already resolves the CLI's configured db path and sets it as a side effect, same as subcommands/run.tsx does at startup.
        await loadMemory()
        const [
          { Agent, askUserTool, buildSystemPrompt, runCommandTool, switchPersonaTool },
          { datasetInfoTool, forgetNoteTool, listNotesTool, recallMemoryTool, rememberNoteTool }
        ] = await Promise.all([import("../agent/agents"), import("@kaja/nasi")])
        const previewTools = [
          askUserTool,
          runCommandTool,
          switchPersonaTool,
          rememberNoteTool,
          recallMemoryTool,
          forgetNoteTool,
          listNotesTool,
          datasetInfoTool
        ]
        const models = await loadModels()
        const personas = await loadPersonas()
        const entries = await Promise.all(
          personas.map(async persona => ({
            persona,
            systemPrompt: await buildSystemPrompt(
              new Agent({
                model:
                  (persona.models?.chat &&
                    models.find(m => m.id === persona.models!.chat && m.task === "chat")?.model) ??
                  "",
                tools: previewTools,
                instructions: persona.instructions,
                dataset: persona.dataset,
                personas,
                personaId: persona.id
              })
            )
          }))
        )
        return html(personasPage(entries))
      },
      "/notes": async () => html(notesPage(await loadMemory())),
      "/notes/delete": {
        POST: async req => {
          const key = (await req.formData()).get("key")
          if (typeof key === "string") {
            const store = await loadMemory()
            if (forgetNotes(store, { key }).length > 0) await saveMemory(store)
          }
          return seeOther("/notes")
        }
      },
      "/sessions": async () => html(sessionsPage(await listSessions())),
      "/sessions/:id": async req => {
        const session = await loadSessionRow(req.params.id)
        return session ? html(sessionPage(session)) : html(notFoundPage(), 404)
      },
      "/sessions/:id/delete": {
        POST: async req => {
          await deleteSessionRow(req.params.id)
          return seeOther("/sessions")
        }
      },
      "/datasets": async () => {
        const [allAnswers, versionSummaries, datasets] = await Promise.all([
          listAllDatasetAnswers(),
          listDatasetVersionsSummary(),
          loadDatasets()
        ])
        const versions: DatasetVersionSummary[] = versionSummaries.map(v => ({
          topic: v.topic,
          owner: v.owner,
          version: v.version,
          answers: allAnswers.filter(a => a.topic === v.topic && a.owner === v.owner && a.version === v.version),
          totalFields: datasets.get(v.topic)?.fields.length,
          completedAt: v.completedAt
        }))
        return html(datasetsPage(versions))
      }
    },
    fetch: () => html(notFoundPage(), 404)
  })
}

/**
 * Runs the server until SIGINT/SIGTERM, matching the "run until killed"
 * shape of `kaja telegram`. Returns an exit code instead of calling
 * process.exit itself, so tests can call it directly.
 */
export async function runWebCli(flags: { port: number }): Promise<number> {
  let server: ReturnType<typeof startWebServer>
  try {
    server = startWebServer(flags.port)
  } catch (error) {
    console.log(error instanceof Error ? error.message : String(error))
    return 1
  }

  console.log(t("web.listening", { url: server.url.href }))
  await new Promise<void>(resolve => {
    const onSignal = () => {
      process.off("SIGINT", onSignal)
      process.off("SIGTERM", onSignal)
      resolve()
    }
    process.on("SIGINT", onSignal)
    process.on("SIGTERM", onSignal)
  })
  await server.stop(true)
  return 0
}
