import type { CliResolvedModel } from "@kaja/schema/config"
import { Box, Text, useWindowSize } from "ink"
import { useEffect, useState } from "react"
import type { Tool } from "../lib/agent/agents"
import { toolName } from "../lib/agent/agents"
import { t } from "../lib/i18n"
import { checkModelAvailability } from "../lib/models/check"

type Availability = "pending" | "up" | "down"

// Display order for the grouped task sections, independent of the order models are merged in (models.toml entries land before settings.toml's stt, which would otherwise put stt before tts/image-generation). rerank sits right after embedding, mirroring the setup wizard's step order — the two are the halves of the same retrieval pipeline.
const TASK_ORDER: CliResolvedModel["task"][] = ["chat", "embedding", "rerank", "tts", "stt", "image-generation"]

const TASK_LABEL_KEY: Record<CliResolvedModel["task"], string> = {
  chat: "startup.taskChat",
  tts: "startup.taskTts",
  stt: "startup.taskStt",
  embedding: "startup.taskEmbedding",
  rerank: "startup.taskRerank",
  "image-generation": "startup.taskImageGen"
}

const STATUS_ICON: Record<Availability, string> = {
  pending: "○",
  up: "✓",
  down: "✗"
}

const STATUS_COLOR: Record<Availability, string> = {
  pending: "gray",
  up: "green",
  down: "red"
}

// A provider can be slow to come up (e.g. a local speaches server still booting) — retry a failed check a few times before settling on "down".
const RETRY_DELAY_MS = 4000
const MAX_ATTEMPTS = 3

// Below this terminal width, the two columns don't have room to sit side by side — stack them instead.
const NARROW_WIDTH_BREAKPOINT = 69

/**
 * Shown in the empty chat viewport before the first message, as two columns
 * (stacked on narrow terminals): left has current persona, configured models
 * grouped by task with a live reachability check against its provider, and a
 * one-line stats summary; right lists the available tool names. Replaced by
 * the normal timeline as soon as the conversation starts.
 */
export function StartupPanel({
  models,
  activeModelId,
  mcpServers = [],
  cwd,
  sessionCount,
  memoryNoteCount,
  tools
}: Readonly<{
  models: CliResolvedModel[]
  /** Id of the chat model actually in use right now. Only this one is shown under the "chat" task group (and gets the live reachability check) — persona-pinned alternates configured in models.toml are not listed here. Non-chat tasks (tts, stt, embedding, image-generation) always show every configured entry and are always checked, since there's no notion of an "active" one among them. */
  activeModelId?: string
  mcpServers?: { id: string; toolCount: number; failed?: boolean }[]
  cwd: string
  sessionCount: number
  memoryNoteCount: number
  tools: Tool<any>[]
}>) {
  const { columns } = useWindowSize()
  const narrow = columns < NARROW_WIDTH_BREAKPOINT
  const [status, setStatus] = useState<Record<number, Availability>>({})

  useEffect(() => {
    let cancelled = false
    const timers: NodeJS.Timeout[] = []

    const attempt = (index: number, model: CliResolvedModel, tries: number) => {
      checkModelAvailability(model).then(available => {
        if (cancelled) return
        if (available) {
          setStatus(prev => ({ ...prev, [index]: "up" }))
          return
        }
        if (tries < MAX_ATTEMPTS) {
          setStatus(prev => ({ ...prev, [index]: "pending" }))
          timers.push(setTimeout(() => attempt(index, model, tries + 1), RETRY_DELAY_MS))
          return
        }
        setStatus(prev => ({ ...prev, [index]: "down" }))
      })
    }

    for (const [index, model] of models.entries())
      if (model.task !== "chat" || model.model === activeModelId) attempt(index, model, 1)

    return () => {
      cancelled = true
      for (const timer of timers) clearTimeout(timer)
    }
  }, [models, activeModelId])

  const grouped = models.reduce<Map<CliResolvedModel["task"], number[]>>((acc, model, index) => {
    if (model.task === "chat" && model.model !== activeModelId) return acc
    const list = acc.get(model.task) ?? []
    list.push(index)
    acc.set(model.task, list)
    return acc
  }, new Map())

  return (
    <Box flexDirection={narrow ? "column" : "row"} gap={narrow ? 1 : 2}>
      <Box flexDirection="column" gap={1} flexGrow={1} flexShrink={1} minWidth={0}>
        <Box>
          <Text color="blackBright" dimColor>
            {t("startup.cwd")}
          </Text>
          <Text color="grey" dimColor bold>
            {cwd}
          </Text>
        </Box>
        {models.length === 0 ? (
          <Text color="blackBright" dimColor>
            {t("startup.noModels")}
          </Text>
        ) : (
          <Box flexDirection="column">
            {[...grouped.entries()]
              .sort(([a], [b]) => TASK_ORDER.indexOf(a) - TASK_ORDER.indexOf(b))
              .map(([task, indices]) => (
                <Box key={task} flexDirection="column">
                  <Text color="blackBright" dimColor>
                    {t(TASK_LABEL_KEY[task])}
                  </Text>
                  {indices.map(index => {
                    const model = models[index]!
                    const state = status[index] ?? "pending"
                    return (
                      <Text color="gray" dimColor key={index}>
                        {"  "}
                        <Text color={STATUS_COLOR[state]}>{STATUS_ICON[state]}</Text> {model.model}
                      </Text>
                    )
                  })}
                </Box>
              ))}
          </Box>
        )}
        {mcpServers.length > 0 && (
          <Box flexDirection="column">
            <Text color="blackBright" dimColor>
              {t("startup.mcpServers")}
            </Text>
            {mcpServers.map(server => (
              <Text color="gray" dimColor key={server.id}>
                {"  "}
                <Text color={server.failed ? "red" : undefined}>{server.failed ? "✗" : "✓"}</Text> {server.id}{" "}
                <Text color="blackBright" dimColor italic>
                  {server.failed
                    ? t("startup.mcpServerFailed")
                    : t("startup.mcpServerToolCount", { count: server.toolCount })}
                </Text>
              </Text>
            ))}
          </Box>
        )}
        <Text color="gray" dimColor>
          {t("startup.stats", {
            sessionCount,
            memoryNoteCount
          })}
        </Text>
      </Box>
      {tools.length > 0 && (
        <Box flexDirection="column" gap={1} flexGrow={1} flexShrink={1} minWidth={0}>
          <Text color="blackBright" dimColor>
            {t("startup.tools")}
          </Text>
          <Box flexDirection="column">
            {tools.map(tool => (
              <Text color="gray" dimColor key={toolName(tool)}>
                {"  "}
                {toolName(tool)}
              </Text>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  )
}
