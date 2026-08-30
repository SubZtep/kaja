import type { CliResolvedModel, KajaPreferences } from "@kaja/schema/config"
import type { PersistedSession } from "@kaja/schema/store"
import { Box, useWindowSize } from "ink"
import { useState } from "react"
import { useAgent } from "../../hooks/use-agent"
import { usePreferences } from "../../hooks/use-preferences"
import { useSound } from "../../hooks/use-sound"
import { useVoice } from "../../hooks/use-voice"
import type { Tool } from "../../lib/agent/agents"
import { savePreferences } from "../../lib/config/config"
import { t } from "../../lib/i18n"
import { log } from "../../lib/logger"
import { client, clientForModel, FREE_CHAT_PROVIDER } from "../../lib/models/openai"
import type { Persona } from "../../lib/personas/personas"
import { StartupPanel } from "../startup-panel"
import { ChatViewport } from "./chat-viewport"
import { ConfirmCommand } from "./confirm-command"
import { Header } from "./header"
import { UserInput } from "./user-input"

type MenuMode = "main" | "persona"

// Slash menu (opened by typing "/" in the input): label + action together. An action returning true keeps the menu open (it swapped in a submenu).
// biome-ignore lint/suspicious/noConfusingVoidType: matches UserInput's onMenuSelect contract
type MenuCommand = { label: string; run: () => boolean | void }

function buildMainMenu({
  thinking,
  sounds,
  voice,
  toggleThinking,
  toggleSounds,
  toggleVoice,
  setMenuMode
}: {
  thinking: boolean
  sounds: boolean
  voice: boolean
  toggleThinking: () => void
  toggleSounds: () => void
  toggleVoice: () => void
  setMenuMode: (mode: MenuMode) => void
}): MenuCommand[] {
  return [
    {
      label: t("menu.toggleThinking", { state: t(thinking ? "menu.on" : "menu.off") }),
      run: toggleThinking
    },
    {
      label: t("menu.toggleSounds", { state: t(sounds ? "menu.on" : "menu.off") }),
      run: toggleSounds
    },
    {
      label: t("menu.toggleVoice", { state: t(voice ? "menu.on" : "menu.off") }),
      run: toggleVoice
    },
    {
      label: t("menu.changePersona"),
      run: () => {
        setMenuMode("persona")
        return true
      }
    }
  ]
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
  personas,
  persona,
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
  personas: Persona[]
  persona: Persona
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
      setMenuMode
    })
  }
  return personas.map(p => ({
    label: `${p.label}${p.id === persona.id ? " ✓" : ""}`,
    run: () => {
      switchPersona(p)
    }
  }))
}

export default function App({
  initialPreferences,
  models = [],
  personas,
  openaiApiModel,
  freeChat = false,
  tools,
  mcpServers = [],
  initialSession,
  promptHistory,
  sessionCount = 0,
  memoryNoteCount = 0
}: Readonly<{
  initialPreferences?: KajaPreferences
  models?: CliResolvedModel[]
  personas: Persona[]
  openaiApiModel: string
  /** True when running on the free hosted (OpenCode Zen) chat tier. */
  freeChat?: boolean
  tools: Tool<any>[]
  /** Connected MCP servers with their tool counts, shown in the startup panel. */
  mcpServers?: { id: string; toolCount: number }[]
  /** A persisted session to continue (--continue / --session <id>). */
  initialSession?: PersistedSession
  /** Past prompts across all sessions for ↑/↓ recall, newest first. */
  promptHistory?: string[]
  /** Saved conversations so far, shown in the startup stats panel. */
  sessionCount?: number
  /** Stored memory notes so far, shown in the startup stats panel. */
  memoryNoteCount?: number
}>) {
  const {
    model,
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
  const switchPersona = (next: Persona) => {
    if (pending) return
    switchPersonaAgent(next)
    savePreferences({ persona: next.id }).catch(error => {
      log.warn({ error }, "Failed to save preferences")
    })
  }
  const lastEvent = events.at(-1)
  const pendingCommand = !pending && lastEvent?.type === "confirm_command" ? lastEvent : undefined
  const { thinking, sounds, voice, toggleThinking, toggleSounds, toggleVoice } = usePreferences(initialPreferences)
  useSound(events, sounds)
  const speaking = useVoice(events, voice, persona.models)
  const { columns, rows } = useWindowSize()

  const [menuMode, setMenuMode] = useState<MenuMode>("main")
  // displayModel may be provider-reported (e.g. free-chat proxy) and match no configured model — on the free tier that's expected, so label it "kaja" rather than showing nothing.
  const provider = models.find(m => m.model === displayModel)?.provider ?? (freeChat ? FREE_CHAT_PROVIDER : undefined)

  const commands = buildCommands({
    menuMode,
    thinking,
    sounds,
    voice,
    toggleThinking,
    toggleSounds,
    toggleVoice,
    setMenuMode,
    personas,
    persona,
    switchPersona
  })

  let bottomChromeKey: "input" | "running" | "confirm" = "input"
  if (pendingCommand) bottomChromeKey = runningCommand ? "running" : "confirm"

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Header
        persona={persona.label}
        model={displayModel}
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
        startupPanel={
          <StartupPanel
            models={models}
            activeModelId={model}
            mcpServers={mcpServers}
            cwd={process.cwd()}
            sessionCount={sessionCount}
            memoryNoteCount={memoryNoteCount}
            toolCount={tools.length}
          />
        }
      />
      {pendingCommand ? (
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
          history={promptHistory}
          menuItems={commands.map(command => command.label)}
          onMenuSelect={index => commands[index]?.run()}
          onMenuClose={() => setMenuMode("main")}
          personaModels={persona.models}
        />
      )}
    </Box>
  )
}
