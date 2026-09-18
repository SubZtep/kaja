import type { PersonaModels } from "@kaja/schema/cli"
import type { CliResolvedModel, KajaPreferences } from "@kaja/schema/config"
import type { PersistedSession } from "@kaja/schema/store"
import { Box, useWindowSize } from "ink"
import notifier from "node-notifier"
import { useState } from "react"
import { type PartialMessage, type TimelineEvent, useAgent } from "../../hooks/use-agent"
import { useCloudAgent } from "../../hooks/use-cloud-agent"
import { usePreferences } from "../../hooks/use-preferences"
import { useSound } from "../../hooks/use-sound"
import { useVoice } from "../../hooks/use-voice"
import type { Tool } from "../../lib/agent/agents"
import { savePreferences } from "../../lib/config/config"
import { t } from "../../lib/i18n"
import { log } from "../../lib/logger"
import { client, clientForModel } from "../../lib/models/openai"
import type { Persona } from "../../lib/personas/personas"
import { ChatViewport } from "./chat-viewport"
import { ConfirmCommand } from "./confirm-command"
import { Header } from "./header"
import { UserInput } from "./user-input"

type MenuMode = "main" | "persona"

// Slash menu (opened by typing "/" in the input): label + action together. An action returning true keeps the menu open (it swapped in a submenu).
// biome-ignore lint/suspicious/noConfusingVoidType: matches UserInput's onMenuSelect contract
type MenuCommand = { label: string; run: () => boolean | void }

/** Which optional chat capabilities the active backend supports — cloud Nasi has no persona catalog to switch between and no local TTS to speak replies with. */
type Capabilities = { persona: boolean; voice: boolean }

function buildMainMenu({
  thinking,
  sounds,
  voice,
  toggleThinking,
  toggleSounds,
  toggleVoice,
  setMenuMode,
  capabilities
}: {
  thinking: boolean
  sounds: boolean
  voice: boolean
  toggleThinking: () => void
  toggleSounds: () => void
  toggleVoice: () => void
  setMenuMode: (mode: MenuMode) => void
  capabilities: Capabilities
}): MenuCommand[] {
  const items: MenuCommand[] = [
    { label: t("menu.toggleThinking", { state: t(thinking ? "menu.on" : "menu.off") }), run: toggleThinking },
    { label: t("menu.toggleSounds", { state: t(sounds ? "menu.on" : "menu.off") }), run: toggleSounds }
  ]
  if (capabilities.voice) {
    items.push({ label: t("menu.toggleVoice", { state: t(voice ? "menu.on" : "menu.off") }), run: toggleVoice })
  }
  if (capabilities.persona) {
    items.push({
      label: t("menu.changePersona"),
      run: () => {
        setMenuMode("persona")
        return true
      }
    })
  }
  return items
}

function buildCommands({
  menuMode,
  thinking,
  sounds,
  voice,
  toggleThinking,
  toggleSounds,
  toggleVoice,
  setMenuMode,
  capabilities,
  personas,
  currentPersonaId,
  switchPersona
}: {
  menuMode: MenuMode
  thinking: boolean
  sounds: boolean
  voice: boolean
  toggleThinking: () => void
  toggleSounds: () => void
  toggleVoice: () => void
  setMenuMode: (mode: MenuMode) => void
  capabilities: Capabilities
  personas: Persona[]
  currentPersonaId?: string
  switchPersona: (next: Persona) => void
}): MenuCommand[] {
  if (menuMode === "main") {
    return buildMainMenu({
      thinking,
      sounds,
      voice,
      toggleThinking,
      toggleSounds,
      toggleVoice,
      setMenuMode,
      capabilities
    })
  }
  return personas.map(p => ({
    label: `${p.label}${p.id === currentPersonaId ? " ✓" : ""}`,
    run: () => {
      switchPersona(p)
    }
  }))
}

/**
 * Chat chrome (Header/ChatViewport/UserInput/ConfirmCommand) shared by both
 * backends. {@link LocalApp} and {@link CloudApp} each drive their own agent
 * hook and normalize its output into these props, so preferences, menu
 * building, sound/voice, and the confirm-command flow are written once and
 * behave identically regardless of which backend is running.
 */
function Chrome({
  personaLabel,
  model,
  provider,
  promptTokens,
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
  resolveCommand
}: Readonly<{
  personaLabel: string
  model: string
  /** Provider name shown after the model, e.g. "fireworks" → "Fireworks". Local only — cloud never exposes the resolved provider. */
  provider?: string
  promptTokens: number | null
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
  personas?: Persona[]
  currentPersonaId?: string
  switchPersona?: (next: Persona) => void
  pendingCommand?: { command: string; description: string }
  runningCommand?: boolean
  resolveCommand?: (command: string, approved: boolean) => Promise<void>
}>) {
  const { thinking, sounds, voice, toggleThinking, toggleSounds, toggleVoice } = usePreferences(initialPreferences)
  useSound(events, sounds)
  const speaking = useVoice(events, capabilities.voice && voice, personaModels)
  const { columns, rows } = useWindowSize()
  const [menuMode, setMenuMode] = useState<MenuMode>("main")

  const commands = buildCommands({
    menuMode,
    thinking,
    sounds,
    voice,
    toggleThinking,
    toggleSounds,
    toggleVoice,
    setMenuMode,
    capabilities,
    personas,
    currentPersonaId,
    switchPersona: switchPersona ?? (() => {})
  })

  let bottomChromeKey: "input" | "running" | "confirm" = "input"
  if (pendingCommand) bottomChromeKey = runningCommand ? "running" : "confirm"

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Header
        persona={personaLabel}
        model={model}
        provider={provider}
        promptTokens={promptTokens}
        currentTool={currentTool}
        width={columns}
      />
      <ChatViewport
        events={events}
        thinking={thinking}
        partial={partial}
        pending={pending}
        sounds={sounds}
        bottomChromeKey={bottomChromeKey}
      />
      {pendingCommand && resolveCommand ? (
        <ConfirmCommand
          key="confirm-command"
          command={pendingCommand.command}
          description={pendingCommand.description}
          running={runningCommand}
          onResolve={approved => resolveCommand(pendingCommand.command, approved)}
        />
      ) : (
        <UserInput
          key="user-input"
          pending={pending}
          speaking={speaking}
          send={send}
          history={history}
          menuItems={commands.map(command => command.label)}
          onMenuSelect={index => commands[index]?.run()}
          onMenuClose={() => setMenuMode("main")}
          personaModels={personaModels}
        />
      )}
    </Box>
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
    runningCommand,
    promptTokens
  } = useAgent({
    model: openaiApiModel,
    client,
    createClient: clientForModel,
    tools,
    personas,
    models,
    // A stored persona/model that no longer exists resolves to undefined and the resume proceeds with defaults — messages restore verbatim anyway.
    initialPersona: personas.find(p => p.id === initialPreferences?.persona),
    resume: initialSession && {
      session: initialSession,
      persona: personas.find(p => p.id === initialSession.persona),
      model: models.find(m => m.model === initialSession.model)
    }
  })

  const switchPersona = async (next: Persona) => {
    if (pending) return
    switchPersonaAgent(next)
    try {
      await savePreferences({ persona: next.id })
      notifier.notify({
        title: t("cli.personaSwitchedTitle"),
        message: t("cli.personaSwitchedMessage", { label: next.label })
      })
    } catch (error) {
      log.warn("Failed to save preferences", { error })
    }
  }

  const lastEvent = events.at(-1)
  const pendingCommand = !pending && lastEvent?.type === "confirm_command" ? lastEvent : undefined
  const provider = models.find(m => m.model === displayModel)?.provider

  return (
    <Chrome
      personaLabel={persona.label}
      model={displayModel}
      provider={provider}
      promptTokens={promptTokens}
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
      resolveCommand={resolveCommand}
    />
  )
}

function CloudApp({
  initialPreferences,
  apiUrl,
  token
}: Readonly<{ initialPreferences?: KajaPreferences; apiUrl: string; token: string }>) {
  const { model, persona, events, partial, pending, currentTool, send, promptTokens } = useCloudAgent({
    baseUrl: apiUrl,
    getToken: async () => token
  })

  return (
    <Chrome
      personaLabel={persona?.label ?? t("cli.connecting")}
      model={model}
      promptTokens={promptTokens}
      currentTool={currentTool}
      events={events}
      partial={partial}
      pending={pending}
      send={send}
      initialPreferences={initialPreferences}
      capabilities={{ persona: false, voice: false }}
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
 * over SSE (`mode: "cloud"`, no persona switching, no MCP, no run_command —
 * cloud never emits those). Both render the same chat chrome via {@link Chrome}.
 */
export default function App(props: LocalAppProps | CloudAppProps) {
  return props.mode === "local" ? <LocalApp {...props} /> : <CloudApp {...props} />
}
