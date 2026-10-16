import { createNasiClient, type NasiClientOptions, NasiStreamError, type NasiStreamEvent } from "@kaja/nasi/client"
import type { NasiClientCall, NasiInfoResponse, NasiToolResult, NasiTurnRequest } from "@kaja/schema/nasi"
import { commandArgument } from "@kaja/shared/telegram"
import { useCallback, useEffect, useRef, useState } from "react"
import type { Approve, Computer } from "../lib/cloud/computer"
import { getLanguage, t } from "../lib/i18n"

/** Same categories `@kaja/nasi`'s categorizeError produces server-side — the server does the actual classification (it's the one that sees the real error), a NasiStreamError just carries its `category` across the wire. Lite never runs categorizeError itself: no local agent tool errors, no raw OpenAI SDK errors to `instanceof`-check, and importing it would pull the openai ability into the lite bundle for nothing. */
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

/** Same shape as apps/tui/hooks/use-agent.ts's TimelineEvent, restricted to what cloud Nasi can ever emit (no display_image/confirm_command — those are local-only; confirm_tool comes from the user's HTTP tools). A tool image's `path` is the data URL it came as. */
export type CloudTimelineEvent =
  | { type: "user"; text: string }
  | { type: "error"; text: string; category: CloudErrorCategory }
  | { type: "notice"; text: string }
  | { type: "tool_image"; path: string; mimeType: string }
  /** A shell command a call on this computer waits to run (only with the opted-in shell). */
  | { type: "confirm_command"; command: string; description: string }
  | Exclude<NasiStreamEvent, { type: "delta" | "usage" | "tool_image" | "client_tool_calls" }>

/** A call on this computer waiting for the user's answer: its prompt, and how to give it. */
export type LocalApproval = {
  event: Extract<CloudTimelineEvent, { type: "confirm_command" | "confirm_tool" }>
  resolve: (approved: boolean) => void
}

/** How the user answered a `confirm_tool`: once, for the rest of the session, or no. */
export type CloudApproval = "approve" | "approve_session" | "decline"

function approvalAnswer(approved: boolean, scope?: "session"): CloudApproval {
  if (!approved) return "decline"
  return scope === "session" ? "approve_session" : "approve"
}

export type CloudPartialMessage = { reasoning: string; content: string }

const DELTA_INTERVAL_MS = 80

/** Rounds in a row where every call on this computer failed before the terminal stops resuming, as `--local` stops its loop. */
const MAX_FAILING_CLIENT_ROUNDS = 3

/**
 * Drives cloud Nasi over `/nasi/turn/stream` from React state — the lite
 * CLI's counterpart to `useAgent`, exposing the same event/partial/pending
 * shape so `Header`/`ChatViewport`/`UserInput` render either backend
 * unmodified. Persona switching (like local) is destructive — it starts a
 * fresh session and pins `personaId` on every subsequent turn, which wins over
 * the persona Nasi keeps with the session; the model's own `switch_persona`
 * moves the pin along. Unlike the local agent, there is no model
 * switching and no run_command confirm flow: cloud never emits those. Tool
 * approvals (`confirm_tool`) are answered with `resolveToolApproval`.
 */
export function useCloudAgent({
  yolo,
  computer,
  ...options
}: NasiClientOptions & {
  /** settings.toml's `yolo`: every `confirm_tool` is approved straight away instead of asking. */
  yolo?: boolean
  /** This computer, when cloud turns may use it: its declarations go with every turn, and it runs their calls. The first turn waits for it to open. */
  computer?: Computer | Promise<Computer | undefined>
}) {
  const [client] = useState(() => createNasiClient(options))
  const sessionRef = useRef<string | undefined>(undefined)
  // The results of the round the failure guard stopped at: they answer those calls with the next message.
  const heldResultsRef = useRef<NasiToolResult[] | undefined>(undefined)

  const [events, setEvents] = useState<CloudTimelineEvent[]>([])
  const eventsRef = useRef(events)
  const pushEvent = useCallback((event: CloudTimelineEvent) => {
    eventsRef.current = [...eventsRef.current, event]
    setEvents(eventsRef.current)
  }, [])

  const [partial, setPartial] = useState<CloudPartialMessage | null>(null)
  const [pending, setPending] = useState(false)
  const [promptTokens, setPromptTokens] = useState<number | null>(null)
  const [contextWindow, setContextWindow] = useState<number | null>(null)
  const [responseModel, setResponseModel] = useState<string | null>(null)
  const [info, setInfo] = useState<NasiInfoResponse | null>(null)
  const [localApproval, setLocalApproval] = useState<LocalApproval | null>(null)
  // This computer's personas (your own, local-only ones): /nasi/info lists only the catalog's, but every turn sends these.
  const [ownPersonas, setOwnPersonas] = useState<{ id: string; label: string }[]>([])
  useEffect(() => {
    let cancelled = false
    // run-cloud's promise logs its own failure and resolves undefined.
    void Promise.resolve(computer).then(here => {
      if (!cancelled && here) setOwnPersonas(here.personas.map(persona => ({ id: persona.id, label: persona.label })))
    })
    return () => {
      cancelled = true
    }
  }, [computer])

  // Selected persona: undefined until either /nasi/info resolves the default, or the user picks one. personaIdRef is the source of truth send() reads synchronously; selectedPersona just mirrors it for display.
  const [selectedPersona, setSelectedPersona] = useState<{ id: string; label: string } | null>(null)
  const personaIdRef = useRef<string | undefined>(undefined)

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
  }, [client])

  const switchPersona = useCallback(
    (next: { id: string; label: string }) => {
      if (pending) return
      sessionRef.current = undefined
      heldResultsRef.current = undefined
      eventsRef.current = []
      setEvents([])
      setPartial(null)
      setPromptTokens(null)
      setResponseModel(null)
      personaIdRef.current = next.id
      setSelectedPersona(next)
    },
    [pending]
  )

  // The model switched persona: the header shows it, and later turns ask for the same one rather than an earlier pick.
  const followPersonaSwitch = useCallback((event: CloudTimelineEvent) => {
    if (event.type !== "persona_switch") return
    personaIdRef.current = event.personaId
    setSelectedPersona({ id: event.personaId, label: event.label })
  }, [])

  /** Asks the user about a call on this computer, through the same prompt as a cloud approval; yolo says yes at once. */
  const approve: Approve = useCallback(
    request => {
      if (yolo) return Promise.resolve(true)
      const event: LocalApproval["event"] =
        request.kind === "command"
          ? { type: "confirm_command", command: request.command, description: "" }
          : { type: "confirm_tool", id: "", name: request.name, arguments: "", summary: request.summary }
      pushEvent(event)
      return new Promise<boolean>(resolve =>
        setLocalApproval({
          event,
          resolve: approved => {
            setLocalApproval(null)
            resolve(approved)
          }
        })
      )
    },
    [yolo, pushEvent]
  )

  /** Runs the calls a turn paused for here, one at a time, each shown as a tool call; their results resume the turn. */
  const runOnComputer = useCallback(
    async (calls: NasiClientCall[]): Promise<NasiToolResult[]> => {
      const here = await computer
      const runOne = async (call: NasiClientCall): Promise<NasiToolResult> => {
        pushEvent({ type: "tool_call", name: call.name, arguments: call.arguments })
        const result = here
          ? await here.run(call, approve, personaIdRef.current ?? info?.persona.id)
          : {
              id: call.id,
              text: "Error: this terminal can't run tools on the user's computer.",
              status: "error" as const
            }
        for (const image of result.images ?? [])
          pushEvent({
            type: "tool_image",
            path: `data:${image.mimeType};base64,${image.data}`,
            mimeType: image.mimeType
          })
        return result
      }
      // Chained, each finished before the next starts: a call may stop to ask the user.
      return calls.reduce<Promise<NasiToolResult[]>>(
        (done, call) => done.then(async results => [...results, await runOne(call)]),
        Promise.resolve([])
      )
    },
    [computer, approve, pushEvent, info]
  )

  /** Runs a turn (a message, or the answer to a `confirm_tool`), then keeps going while yolo approves what the server asks about and while it waits on this computer. */
  const runTurns = useCallback(
    async (first: { message: string } | { approval: CloudApproval }) => {
      setPending(true)

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
        if (event.contextWindow != null) setContextWindow(event.contextWindow)
        if (event.model) setResponseModel(event.model)
      }

      const handleEvent = (event: CloudTimelineEvent) => {
        // A finalized event replaces what was streaming, so the next round starts from empty rather than resurrecting its text
        accumulated.reasoning = ""
        accumulated.content = ""
        hasPartial = false
        setPartial(null)
        pushEvent(event)
        followPersonaSwitch(event)
      }

      let clientCalls: NasiClientCall[] = []
      const handleStreamEvent = (event: NasiStreamEvent) => {
        if (event.type === "delta") handleDelta(event)
        else if (event.type === "client_tool_calls") clientCalls = event.calls
        else if (event.type === "usage") handleUsage(event)
        else if (event.type === "tool_image")
          handleEvent({ type: "tool_image", path: event.url, mimeType: event.mimeType })
        // Yolo answers it below, so there's no question to show
        else if (!(yolo && event.type === "confirm_tool")) handleEvent(event)
      }

      // Sent with every turn: what this computer runs, so the cloud never runs those itself.
      const here = await computer
      const declared: Partial<NasiTurnRequest> = here
        ? { clientTools: here.tools, clientSkills: here.skills, clientPersonas: here.personas }
        : {}
      const held = "message" in first ? heldResultsRef.current : undefined
      heldResultsRef.current = undefined
      try {
        let request:
          | { message: string; toolResults?: NasiToolResult[] }
          | { approval: CloudApproval }
          | { toolResults: NasiToolResult[] } = held ? { ...first, toolResults: held } : first
        let failingRounds = 0
        while (true) {
          clientCalls = []
          // TODO: forward includeThinking (from the thinking preference) once something depends on the request
          // body reflecting it — the stream currently emits reasoning events unconditionally regardless, and
          // display is already gated client-side by the `thinking` prop threaded through Chrome.
          const gen = client.turn_stream({
            session: sessionRef.current,
            ...declared,
            ...request,
            language: getLanguage(),
            personaId: personaIdRef.current
          })
          let next = await gen.next()
          while (!next.done) {
            const event = next.value
            handleStreamEvent(event)
            next = await gen.next()
          }
          sessionRef.current = next.value.session
          if (next.value.status === "needs_client_tool") {
            const results = await runOnComputer(clientCalls)
            const allFailed = results.length > 0 && results.every(result => result.status === "error")
            failingRounds = allFailed ? failingRounds + 1 : 0
            if (failingRounds >= MAX_FAILING_CLIENT_ROUNDS) {
              heldResultsRef.current = results
              pushEvent({
                type: "error",
                text: t("timeline.computerStopped", { count: MAX_FAILING_CLIENT_ROUNDS }),
                category: "tool"
              })
              break
            }
            request = { toolResults: results }
            continue
          }
          if (!yolo || next.value.status !== "needs_approval") break
          request = { approval: "approve" }
        }
      } catch (error) {
        const { category, message } = categorizeCloudError(error)
        pushEvent({ type: "error", text: message, category })
      } finally {
        setPartial(null)
        setPending(false)
      }
    },
    [client, pushEvent, followPersonaSwitch, yolo, computer, runOnComputer]
  )

  // `/compact [focus]`: the server summarises the session now instead of running a turn.
  const compactNow = useCallback(
    async (focus: string) => {
      const session = sessionRef.current
      if (!session) return pushEvent({ type: "notice", text: t("timeline.nothingToCompact") })
      setPending(true)
      try {
        const { compacted } = await client.compact({ session, focus: focus || undefined })
        if (compacted) {
          pushEvent({ type: "compacted", ...compacted })
          setPromptTokens(compacted.afterTokens)
        } else pushEvent({ type: "notice", text: t("timeline.nothingToCompact") })
      } catch (error) {
        const { category, message } = categorizeCloudError(error)
        pushEvent({ type: "error", text: message, category })
      } finally {
        setPending(false)
      }
    },
    [client, pushEvent]
  )

  const send = useCallback(
    async (prompt: string, showUserEvent = true) => {
      if (showUserEvent) pushEvent({ type: "user", text: prompt })
      const focus = showUserEvent ? commandArgument(prompt, "compact") : undefined
      if (focus !== undefined) return compactNow(focus)
      await runTurns({ message: prompt })
    },
    [pushEvent, runTurns, compactNow]
  )

  /** Answers the pending `confirm_tool`: the server runs (or skips) the call it saved; nothing about the call is sent back. */
  const resolveToolApproval = useCallback(
    (approved: boolean, scope?: "session") => runTurns({ approval: approvalAnswer(approved, scope) }),
    [runTurns]
  )

  // Mirrors useAgent's currentTool: derived from the last event rather than tracked separately, since a later event naturally supersedes it.
  const lastEvent = events.at(-1)
  const currentTool = pending && lastEvent?.type === "tool_call" ? lastEvent : undefined

  return {
    model: responseModel ?? info?.model ?? "kaja",
    persona: selectedPersona ?? info?.persona,
    personas: [
      ...(info?.personas ?? []).filter(persona => !ownPersonas.some(own => own.id === persona.id)),
      ...ownPersonas
    ],
    currentPersonaId: selectedPersona?.id ?? info?.persona?.id,
    switchPersona,
    tools: info?.tools ?? [],
    events,
    partial,
    pending,
    currentTool,
    send,
    resolveToolApproval,
    localApproval,
    promptTokens,
    contextWindow
  }
}
