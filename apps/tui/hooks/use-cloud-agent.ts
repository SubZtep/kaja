import { listFilesTool, readFileTool, type Tool } from "@kaja/nasi"
import { createNasiClient, type NasiClientOptions, NasiStreamError, type NasiStreamEvent } from "@kaja/nasi/client"
import type { NasiInfoResponse } from "@kaja/schema/nasi"
import { useCallback, useEffect, useRef, useState } from "react"
import { getLanguage } from "../lib/i18n"

/** Tools the server hands back to the client to run locally instead of executing itself — see registry.ts's CLIENT_EXECUTABLE. Keyed by tool name from the `client_tool_call` event. */
const CLIENT_TOOLS: Record<string, Tool<any>> = {
  read_file: readFileTool,
  list_files: listFilesTool
}

/**
 * Runs a server-requested tool against the local filesystem and returns the
 * text to feed back as that tool's result. Errors (bad args, path-guard
 * denials) are caught and returned as a string rather than thrown, so a bad
 * path lets the model see the failure and react instead of crashing the turn.
 */
async function executeClientTool(name: string, argumentsJson: string): Promise<string> {
  const tool = CLIENT_TOOLS[name]
  if (!tool) return `Error: unknown client tool "${name}"`
  try {
    const args = JSON.parse(argumentsJson)
    const result = await tool.execute(args)
    return typeof result === "string" ? result : result.text
  } catch (error) {
    return `Error: ${error instanceof Error ? error.message : String(error)}`
  }
}

/** Same categories `@kaja/nasi`'s categorizeError produces server-side — the server does the actual classification (it's the one that sees the real error), a NasiStreamError just carries its `category` across the wire. Lite never runs categorizeError itself: no local agent tool errors, no raw OpenAI SDK errors to `instanceof`-check, and importing it would pull the openai package into the lite bundle for nothing. */
export type CloudErrorCategory = "network" | "tool" | "agent" | "unknown"

function isCloudErrorCategory(value: string | undefined): value is CloudErrorCategory {
  return value === "network" || value === "tool" || value === "agent" || value === "unknown"
}

function categorizeCloudError(error: unknown): { category: CloudErrorCategory; message: string } {
  if (error instanceof NasiStreamError) {
    return { category: isCloudErrorCategory(error.category) ? error.category : "network", message: error.message }
  }
  if (error instanceof TypeError) return { category: "network", message: error.message }
  if (error instanceof Error) return { category: "unknown", message: error.message }
  return { category: "unknown", message: String(error) }
}

/** Same shape as apps/tui/hooks/use-agent.ts's TimelineEvent, restricted to what cloud Nasi can ever emit (no tool_image/display_image/confirm_command — those are local-only). */
export type CloudTimelineEvent =
  | { type: "user"; text: string }
  | { type: "error"; text: string; category: CloudErrorCategory }
  | Exclude<NasiStreamEvent, { type: "delta" | "usage" }>

export type CloudPartialMessage = { reasoning: string; content: string }

const DELTA_INTERVAL_MS = 80

/**
 * Drives cloud Nasi over `/nasi/turn/stream` from React state — the lite
 * CLI's counterpart to `useAgent`, exposing the same event/partial/pending
 * shape so `Header`/`ChatViewport`/`UserInput` render either backend
 * unmodified. Unlike the local agent, there is no persona catalog, no model
 * switching, and no run_command confirm flow: cloud never emits those.
 */
export function useCloudAgent(options: NasiClientOptions) {
  const [client] = useState(() => createNasiClient(options))
  const sessionRef = useRef<string | undefined>(undefined)

  const [events, setEvents] = useState<CloudTimelineEvent[]>([])
  const eventsRef = useRef(events)
  const pushEvent = useCallback((event: CloudTimelineEvent) => {
    eventsRef.current = [...eventsRef.current, event]
    setEvents(eventsRef.current)
  }, [])

  const [partial, setPartial] = useState<CloudPartialMessage | null>(null)
  const [pending, setPending] = useState(false)
  const [promptTokens, setPromptTokens] = useState<number | null>(null)
  const [responseModel, setResponseModel] = useState<string | null>(null)
  const [info, setInfo] = useState<NasiInfoResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    client.info(sessionRef.current).then(
      result => {
        if (!cancelled) setInfo(result)
      },
      () => {}
    )
    return () => {
      cancelled = true
    }
  }, [])

  const send = useCallback(
    async (prompt: string, showUserEvent = true) => {
      setPending(true)
      if (showUserEvent) pushEvent({ type: "user", text: prompt })

      const accumulated: CloudPartialMessage = { reasoning: "", content: "" }
      let hasPartial = false
      let lastFlush = 0
      const flush = () => {
        if (hasPartial) setPartial({ ...accumulated })
      }

      const handleDelta = (event: Extract<NasiStreamEvent, { type: "delta" }>) => {
        accumulated[event.channel] += event.text
        hasPartial = true
        const now = Date.now()
        if (now - lastFlush >= DELTA_INTERVAL_MS) {
          lastFlush = now
          flush()
        }
      }

      const handleUsage = (event: Extract<NasiStreamEvent, { type: "usage" }>) => {
        if (event.promptTokens != null) setPromptTokens(event.promptTokens)
        if (event.model) setResponseModel(event.model)
      }

      try {
        let nextMessage = prompt
        while (true) {
          // TODO: forward includeThinking (from the thinking preference) once something depends on the request
          // body reflecting it — the stream currently emits reasoning events unconditionally regardless, and
          // display is already gated client-side by the `thinking` prop threaded through Chrome.
          const gen = client.turn_stream({ session: sessionRef.current, message: nextMessage, language: getLanguage() })
          let next = await gen.next()
          let pendingClientTool: Extract<CloudTimelineEvent, { type: "client_tool_call" }> | undefined
          while (!next.done) {
            const event = next.value
            if (event.type === "delta") handleDelta(event)
            else if (event.type === "usage") handleUsage(event)
            else {
              setPartial(null)
              pushEvent(event)
              if (event.type === "client_tool_call") pendingClientTool = event
            }
            next = await gen.next()
          }
          sessionRef.current = next.value.session
          if (next.value.status !== "needs_client_tool" || !pendingClientTool) break
          nextMessage = await executeClientTool(pendingClientTool.name, pendingClientTool.arguments)
        }
      } catch (error) {
        const { category, message } = categorizeCloudError(error)
        pushEvent({ type: "error", text: message, category })
      } finally {
        setPartial(null)
        setPending(false)
      }
    },
    [client, pushEvent]
  )

  // Mirrors useAgent's currentTool: derived from the last event rather than tracked separately, since a later event naturally supersedes it.
  const lastEvent = events.at(-1)
  const currentTool =
    pending && (lastEvent?.type === "tool_call" || lastEvent?.type === "client_tool_call") ? lastEvent : undefined

  return {
    model: responseModel ?? info?.model ?? "kaja",
    persona: info?.persona,
    tools: info?.tools ?? [],
    events,
    partial,
    pending,
    currentTool,
    send,
    promptTokens
  }
}
