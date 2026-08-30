import { createNasiClient, type NasiClientOptions, NasiStreamError, type NasiStreamEvent } from "@kaja/nasi/client"
import { useCallback, useRef, useState } from "react"

/** Lite's error surface is just network/HTTP — no local agent tool errors, no raw OpenAI SDK errors, so this doesn't need @kaja/nasi's categorizeError (importing that would pull the openai package into the lite bundle for an instanceof check that can never match here). */
export type RemoteErrorCategory = "network" | "unknown"

function categorizeRemoteError(error: unknown): { category: RemoteErrorCategory; message: string } {
  if (error instanceof NasiStreamError) return { category: "network", message: error.message }
  if (error instanceof TypeError) return { category: "network", message: error.message }
  if (error instanceof Error) return { category: "unknown", message: error.message }
  return { category: "unknown", message: String(error) }
}

/** Same shape as apps/cli/hooks/use-agent.ts's TimelineEvent, restricted to what hosted Nasi can ever emit (no tool_image/display_image/confirm_command — those are local-only). */
export type RemoteTimelineEvent =
  | { type: "user"; text: string }
  | { type: "error"; text: string; category: RemoteErrorCategory }
  | Exclude<NasiStreamEvent, { type: "delta" | "usage" }>

export type RemotePartialMessage = { reasoning: string; content: string }

const DELTA_INTERVAL_MS = 80

/**
 * Drives hosted Nasi over `/nasi/turn/stream` from React state — the lite
 * CLI's counterpart to `useAgent`, exposing the same event/partial/pending
 * shape so `Header`/`ChatViewport`/`UserInput` render either backend
 * unmodified. Unlike the local agent, there is no persona catalog, no model
 * switching, and no run_command confirm flow: hosted never emits those.
 */
export function useRemoteAgent(options: NasiClientOptions) {
  const [client] = useState(() => createNasiClient(options))
  const sessionRef = useRef<string | undefined>(undefined)

  const [events, setEvents] = useState<RemoteTimelineEvent[]>([])
  const eventsRef = useRef(events)
  const pushEvent = useCallback((event: RemoteTimelineEvent) => {
    eventsRef.current = [...eventsRef.current, event]
    setEvents(eventsRef.current)
  }, [])

  const [partial, setPartial] = useState<RemotePartialMessage | null>(null)
  const [pending, setPending] = useState(false)
  const [promptTokens, setPromptTokens] = useState<number | null>(null)
  const [responseModel, setResponseModel] = useState<string | null>(null)

  const send = useCallback(
    async (prompt: string, showUserEvent = true) => {
      setPending(true)
      if (showUserEvent) pushEvent({ type: "user", text: prompt })

      const accumulated: RemotePartialMessage = { reasoning: "", content: "" }
      let hasPartial = false
      let lastFlush = 0
      const flush = () => {
        if (hasPartial) setPartial({ ...accumulated })
      }

      try {
        const gen = client.turn_stream({ session: sessionRef.current, message: prompt })
        let next = await gen.next()
        while (!next.done) {
          const event = next.value
          if (event.type === "delta") {
            accumulated[event.channel] += event.text
            hasPartial = true
            const now = Date.now()
            if (now - lastFlush >= DELTA_INTERVAL_MS) {
              lastFlush = now
              flush()
            }
          } else if (event.type === "usage") {
            if (event.promptTokens != null) setPromptTokens(event.promptTokens)
            if (event.model) setResponseModel(event.model)
          } else {
            setPartial(null)
            pushEvent(event)
          }
          next = await gen.next()
        }
        sessionRef.current = next.value.session
      } catch (error) {
        const { category, message } = categorizeRemoteError(error)
        pushEvent({ type: "error", text: message, category })
      } finally {
        setPartial(null)
        setPending(false)
      }
    },
    [client, pushEvent]
  )

  return {
    model: responseModel ?? "kaja",
    events,
    partial,
    pending,
    send,
    promptTokens
  }
}
