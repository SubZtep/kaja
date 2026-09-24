import { ThemeProvider } from "@inkjs/ui"
import type { PersonaModels } from "@kaja/schema/cli"
import type { CliResolvedModel, KajaPreferences } from "@kaja/schema/config"
import type { PersistedSession } from "@kaja/schema/store"
import { Box, useWindowSize } from "ink"
import notifier from "node-notifier"
import open from "open"
import { useState } from "react"
import { type PartialMessage, type TimelineEvent, useAgent } from "../../hooks/use-agent"
import { useCloudAgent } from "../../hooks/use-cloud-agent"
import { useModifierKeys } from "../../hooks/use-modifier-keys"
import { usePreferences } from "../../hooks/use-preferences"
import { useSound } from "../../hooks/use-sound"
import { useTheme } from "../../hooks/use-theme"
import { useVoice } from "../../hooks/use-voice"
import type { Tool } from "../../lib/agent/agents"
import { t } from "../../lib/i18n"
import { log } from "../../lib/logger"
import { client, clientForModel, compactAt, summarizer } from "../../lib/models/openai"
import type { Persona } from "../../lib/personas/personas"
import { themes } from "../theme"
import { ChatViewport } from "./chat-viewport"
import { ConfirmCommand } from "./confirm-command"
import { Header } from "./header"
import { KeyBar } from "./key-bar"
import { PersonaPicker } from "./persona-picker"
import { UserInput } from "./user-input"

/** Docs shown by the help keybar entry. */
const HELP_URL = "https://docs.kaja.io/tui/"

/** Which optional chat capabilities the active backend supports — cloud Nasi has no local TTS to speak replies with. */
type Capabilities = { persona: boolean; voice: boolean }

type BottomChromeKey = "input" | "running" | "confirm" | "persona"

function getBottomChromeKey(
  pickingPersona: boolean,
  pendingCommand: unknown,
  runningCommand: boolean
): BottomChromeKey {
  if (pickingPersona) return "persona"
  if (!pendingCommand) return "input"
  return runningCommand ? "running" : "confirm"
}

// Esc means something different depending on what's showing — quit while typing, but just dismiss the
// picker/confirm prompt over it. While a command is actually running there's nothing bound to Esc (no entry).
function escKeyBarItem(bottomChromeKey: BottomChromeKey): { key: string; label: string } | undefined {
  const labels: Partial<Record<BottomChromeKey, string>> = {
    persona: t("keybar.cancel"),
    confirm: t("keybar.decline"),
    input: t("keybar.quit")
  }
  const label = labels[bottomChromeKey]
  return label ? { key: "Esc", label } : undefined
}

/** What the confirm prompt shows for a paused call: the shell command, or the tool's request summary. */
function confirmPrompt(
  event:
    | { type: "confirm_command"; command: string; description: string }
    | { type: "confirm_tool"; name: string; summary: string }
): { command: string; description: string; kind: "command" | "tool" } {
  if (event.type === "confirm_command")
    return { command: event.command, description: event.description, kind: "command" }
  return { command: event.summary, description: t("confirmCommand.toolRequest", { name: event.name }), kind: "tool" }
}

function buildKeyBarItems(hotkeyModifier: string | undefined, hasPersona: boolean, bottomChromeKey: BottomChromeKey) {
  const modifierLabel = hotkeyModifier === "ctrl" ? "Ctrl" : "Alt"
  const escItem = escKeyBarItem(bottomChromeKey)
  return [
    { key: `${modifierLabel}+L`, label: t("keybar.help") },
    ...(hasPersona ? [{ key: `${modifierLabel}+P`, label: t("keybar.persona") }] : []),
    { key: `${modifierLabel}+R`, label: t("keybar.copy") },
    { key: `${modifierLabel}+D`, label: t("keybar.theme") },
    ...(escItem ? [escItem] : [])
  ]
}

/**
 * Chat chrome (Header/ChatViewport/UserInput/ConfirmCommand/PersonaPicker)
 * shared by both backends. {@link LocalApp} and {@link CloudApp} each drive
 * their own agent hook and normalize its output into these props, so
 * preferences, sound/voice, the confirm-command flow, and persona switching
 * are written once and behave identically regardless of which backend is
 * running.
 */
function Chrome({
  personaLabel,
  model,
  provider,
  promptTokens,
  contextWindow,
  currentTool,
  events,
  partial,
  pending,
  send,
  initialPreferences,
  personaModels,
  history,
  capabilities,
  personas = [],
  currentPersonaId,
  switchPersona,
  pendingCommand,
  runningCommand = false,
  resolvePending
}: Readonly<{
  personaLabel: string
  model: string
  /** Provider name shown after the model, e.g. "fireworks" → "Fireworks". Local only — cloud never exposes the resolved provider. */
  provider?: string
  promptTokens: number | null
  contextWindow: number | null
  currentTool?: { name: string; arguments: string }
  events: TimelineEvent[]
  partial: PartialMessage | null
  pending: boolean
  send: (prompt: string, showUserEvent?: boolean) => Promise<void>
  initialPreferences?: KajaPreferences
  personaModels?: PersonaModels
  /** Past prompts across all sessions for ↑/↓ recall, newest first. Local only. */
  history?: string[]
  capabilities: Capabilities
  personas?: Persona[] | { id: string; label: string }[]
  currentPersonaId?: string
  switchPersona?: (next: { id: string; label: string }) => void
  /** A run_command or an HTTP tool call waiting on approval; `command` is the shell command or the request summary. */
  pendingCommand?: { command: string; description: string; kind: "command" | "tool" }
  runningCommand?: boolean
  resolvePending?: (approved: boolean) => Promise<void>
}>) {
  const { thinking, sounds, voice, hotkeyModifier, theme: initialTheme } = usePreferences(initialPreferences)
  const { theme, toggle: toggleTheme } = useTheme(initialTheme)
  useSound(events, sounds)
  const speaking = useVoice(events, capabilities.voice && voice, personaModels)
  const { columns, rows } = useWindowSize()
  const [pickingPersona, setPickingPersona] = useState(false)

  useModifierKeys(hotkeyModifier, {
    // "L" for help, not "H": Ctrl+H is byte-identical to Backspace (0x08), so it could
    // never fire under hotkeyModifier: "ctrl" — Ink has no way to tell the two apart.
    l: () => {
      open(HELP_URL).catch(error => log.warn("Failed to open help URL", { error }))
    },
    p: () => {
      if (capabilities.persona && !pending) setPickingPersona(true)
    },
    // "D" for dark/light: T is taken by Ctrl+T (dictation) under hotkeyModifier: "ctrl"
    d: toggleTheme
  })

  const bottomChromeKey = getBottomChromeKey(pickingPersona, pendingCommand, runningCommand)
  const showConfirm = bottomChromeKey !== "persona" && Boolean(pendingCommand && resolvePending)
  const keyBarItems = buildKeyBarItems(hotkeyModifier, capabilities.persona, bottomChromeKey)

  return (
    <ThemeProvider theme={themes[theme]}>
      <Box flexDirection="column" width={columns} height={rows}>
        <Header
          persona={personaLabel}
          model={model}
          provider={provider}
          promptTokens={promptTokens}
          contextWindow={contextWindow}
          currentTool={currentTool}
          width={columns}
        />
        <ChatViewport
          events={events}
          thinking={thinking}
          partial={partial}
          pending={pending}
          sounds={sounds}
          hotkeyModifier={hotkeyModifier}
          bottomChromeKey={bottomChromeKey}
        />
        {bottomChromeKey === "persona" && (
          <PersonaPicker
            key="persona-picker"
            personas={personas}
            currentPersonaId={currentPersonaId}
            onSelect={next => {
              switchPersona?.(next)
              setPickingPersona(false)
            }}
            onCancel={() => setPickingPersona(false)}
          />
        )}
        {showConfirm && pendingCommand && resolvePending && (
          <ConfirmCommand
            key="confirm-command"
            command={pendingCommand.command}
            description={pendingCommand.description}
            kind={pendingCommand.kind}
            running={runningCommand}
            onResolve={approved => resolvePending(approved)}
          />
        )}
        {bottomChromeKey !== "persona" && !showConfirm && (
          <UserInput
            key="user-input"
            pending={pending}
            speaking={speaking}
            send={send}
            history={history}
            personaModels={personaModels}
          />
        )}
        <KeyBar items={keyBarItems} />
      </Box>
    </ThemeProvider>
  )
}

function LocalApp({
  initialPreferences,
  models = [],
  personas,
  openaiApiModel,
  tools,
  initialSession,
  promptHistory
}: Readonly<{
  initialPreferences?: KajaPreferences
  models?: CliResolvedModel[]
  personas: Persona[]
  openaiApiModel: string
  tools: Tool<any>[]
  initialSession?: PersistedSession
  promptHistory?: string[]
}>) {
  const {
    displayModel,
    persona,
    switchPersona: switchPersonaAgent,
    events,
    partial,
    pending,
    currentTool,
    send,
    resolveCommand,
    resolveToolApproval,
    runningCommand,
    promptTokens,
    contextWindow
  } = useAgent({
    model: openaiApiModel,
    client,
    createClient: clientForModel,
    summarizer,
    compactAt,
    tools,
    personas,
    models,
    // Stored session's persona/model may no longer exist; resolves to undefined and the resume proceeds with defaults — messages restore verbatim anyway.
    resume: initialSession && {
      session: initialSession,
      persona: personas.find(p => p.id === initialSession.persona),
      model: models.find(m => m.model === initialSession.model)
    }
  })

  const switchPersona = (next: { id: string; label: string }) => {
    if (pending) return
    const target = personas.find(p => p.id === next.id)
    if (!target) return
    switchPersonaAgent(target)
    notifier.notify({
      title: t("cli.personaSwitchedTitle"),
      message: t("cli.personaSwitchedMessage", { label: target.label })
    })
  }

  const lastEvent = events.at(-1)
  const pendingEvent =
    !pending && (lastEvent?.type === "confirm_command" || lastEvent?.type === "confirm_tool") ? lastEvent : undefined
  const pendingCommand = pendingEvent && confirmPrompt(pendingEvent)
  const resolvePending = pendingEvent
    ? (approved: boolean) =>
        pendingEvent.type === "confirm_command"
          ? resolveCommand(pendingEvent.command, approved)
          : resolveToolApproval(pendingEvent.name, pendingEvent.arguments, approved)
    : undefined
  const provider = models.find(m => m.model === displayModel)?.provider

  return (
    <Chrome
      personaLabel={persona.label}
      model={displayModel}
      provider={provider}
      promptTokens={promptTokens}
      contextWindow={contextWindow}
      currentTool={currentTool}
      events={events}
      partial={partial}
      pending={pending}
      send={send}
      initialPreferences={initialPreferences}
      personaModels={persona.models}
      history={promptHistory}
      capabilities={{ persona: true, voice: true }}
      personas={personas}
      currentPersonaId={persona.id}
      switchPersona={switchPersona}
      pendingCommand={pendingCommand}
      runningCommand={runningCommand}
      resolvePending={resolvePending}
    />
  )
}

function CloudApp({
  initialPreferences,
  apiUrl,
  token
}: Readonly<{ initialPreferences?: KajaPreferences; apiUrl: string; token: string }>) {
  const {
    model,
    persona,
    personas,
    currentPersonaId,
    switchPersona,
    events,
    partial,
    pending,
    currentTool,
    send,
    resolveToolApproval,
    promptTokens,
    contextWindow
  } = useCloudAgent({
    baseUrl: apiUrl,
    getToken: async () => token
  })

  const lastEvent = events.at(-1)
  const pendingEvent = !pending && lastEvent?.type === "confirm_tool" ? lastEvent : undefined

  return (
    <Chrome
      personaLabel={persona?.label ?? t("cli.connecting")}
      model={model}
      promptTokens={promptTokens}
      contextWindow={contextWindow}
      currentTool={currentTool}
      events={events}
      partial={partial}
      pending={pending}
      send={send}
      initialPreferences={initialPreferences}
      capabilities={{ persona: true, voice: false }}
      personas={personas}
      currentPersonaId={currentPersonaId}
      switchPersona={switchPersona}
      pendingCommand={pendingEvent && confirmPrompt(pendingEvent)}
      runningCommand={false}
      resolvePending={pendingEvent ? resolveToolApproval : undefined}
    />
  )
}

type LocalAppProps = Readonly<{
  mode: "local"
  initialPreferences?: KajaPreferences
  models?: CliResolvedModel[]
  personas: Persona[]
  openaiApiModel: string
  tools: Tool<any>[]
  /** A persisted session to continue (--continue / --session <id>). */
  initialSession?: PersistedSession
  /** Past prompts across all sessions for ↑/↓ recall, newest first. */
  promptHistory?: string[]
}>

type CloudAppProps = Readonly<{
  mode: "cloud"
  initialPreferences?: KajaPreferences
  apiUrl: string
  token: string
}>

/**
 * The CLI's chat screen, backed by either the local {@link Agent} loop
 * (`mode: "local"`, full tools/persona catalog/run_command) or cloud Nasi
 * over SSE (`mode: "cloud"`, no MCP, no run_command — cloud never emits
 * those — but the user's HTTP tools may ask for approval). Both render the same chat chrome via {@link Chrome}, including
 * the configurable-modifier keybar (help / persona picker; see use-modifier-keys.ts).
 */
export default function App(props: LocalAppProps | CloudAppProps) {
  return props.mode === "local" ? <LocalApp {...props} /> : <CloudApp {...props} />
}
