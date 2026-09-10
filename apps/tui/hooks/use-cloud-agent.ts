import { createNasiClient, type NasiClientOptions, NasiStreamError, type NasiStreamEvent } from "@kaja/nasi/client"
import type { NasiInfoResponse } from "@kaja/schema/nasi"
import { useCallback, useEffect, useRef, useState } from "react"
import { getLanguage } from "../lib/i18n"

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
        const gen = client.turn_stream({ session: sessionRef.current, message: prompt, language: getLanguage() })
        let next = await gen.next()
        while (!next.done) {
          const event = next.value
          if (event.type === "delta") handleDelta(event)
          else if (event.type === "usage") handleUsage(event)
          else {
            setPartial(null)
            pushEvent(event)
          }
          next = await gen.next()
        }
        sessionRef.current = next.value.session
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

  return {
    model: responseModel ?? info?.model ?? "kaja",
    persona: info?.persona,
    tools: info?.tools ?? [],
    events,
    partial,
    pending,
    send,
    promptTokens
  }
}
