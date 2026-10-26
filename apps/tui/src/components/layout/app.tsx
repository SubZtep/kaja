import { ThemeProvider } from "@inkjs/ui"
import type { PersonaModels } from "@kaja/schema/cli"
import type { CliResolvedModel, KajaPreferences } from "@kaja/schema/config"
import type { PersistedSession } from "@kaja/schema/store"
import { Box, useWindowSize } from "ink"
import open from "open"
import { useState } from "react"
import { type PartialMessage, type TimelineEvent, useAgent } from "../../hooks/use-agent"
import { useCloudAgent } from "../../hooks/use-cloud-agent"
import { useCodeView } from "../../hooks/use-code-view"
import { useHooks } from "../../hooks/use-hooks"
import { type HotkeyModifier, modifierLabel, useModifierHeld, useModifierKeys } from "../../hooks/use-modifier-keys"
import { usePreferences } from "../../hooks/use-preferences"
import { useQuitGuard } from "../../hooks/use-quit-guard"
import { useTheme } from "../../hooks/use-theme"
import { useVoice } from "../../hooks/use-voice"
import type { Tool } from "../../lib/agent/agents"
import type { Computer } from "../../lib/cloud/computer"
import { fireHook } from "../../lib/config/hooks"
import { t } from "../../lib/i18n"
import { log } from "../../lib/logger"
import { client, clientForModel, compactAt, describer, summarizer } from "../../lib/models/openai"
import type { Persona } from "../../lib/personas/personas"
import { uiEvents } from "../../lib/ui-events"
import { CodeViewContext } from "../elem/code-expand"
import { Backdrop, ModalHost } from "../elem/modal"
import { DashedRule } from "../elem/rule"
import { themeFor } from "../theme"
import { ChatViewport } from "./chat-viewport"
import { CommandModal } from "./command-modal"
import { ConfirmCommand } from "./confirm-command"
import { Header } from "./header"
import { HelpModal } from "./help-modal"
import { KeyBar, type KeyBarEntry } from "./key-bar"
import { PersonaPicker } from "./persona-picker"
import { Prompt } from "./prompt"
import { UserInput } from "./user-input"

/** Docs shown by the help keybar entry. */
const HELP_URL = "https://docs.kaja.io/use/tui/"

// Shared empty defaults: a fresh `[]` per render would change the prop each time
const NO_PERSONAS: Persona[] = []
const NO_MODELS: CliResolvedModel[] = []

/** Which optional chat capabilities the active backend supports — cloud Nasi has no local TTS to speak replies with. */
type Capabilities = { persona: boolean; voice: boolean }

type BottomChromeKey = "input" | "running" | "confirm" | "modal"

/** The window over the chat, if any; more are added here. */
type ModalName = "help" | "persona" | "command"

function getBottomChromeKey(modalOpen: boolean, pendingCommand: unknown, runningCommand: boolean): BottomChromeKey {
  if (modalOpen) return "modal"
  if (!pendingCommand) return "input"
  return runningCommand ? "running" : "confirm"
}

/** The ask_user tool call the turn ended on, so the next input is its answer (a plain "?" reply has no fromTool). */
const pendingQuestion = (events: TimelineEvent[], pending: boolean) => {
  const last = events.at(-1)
  return !pending && last?.type === "ask_user" && last.fromTool === true ? last : undefined
}

/** Whether Esc quits here (typing, or a command running) rather than dismissing a prompt. */
const isQuittable = (key: BottomChromeKey) => key === "input" || key === "running"

// Esc means something different depending on what's showing — quit while typing or while a command runs, but just dismiss the
// modal/confirm prompt over it.
function escKeyBarItem(
  bottomChromeKey: BottomChromeKey,
  quittable: boolean,
  clearing: boolean,
  quitArmed: boolean,
  pressQuit: () => void
): KeyBarEntry | undefined {
  // Text typed in a prompt: Esc empties it first, whatever it would do otherwise
  if (clearing) return { key: "Esc", label: t("keybar.clear") }
  const quit = quitArmed ? t("keybar.quitAgain") : t("keybar.quit")
  const labels: Partial<Record<BottomChromeKey, string>> = {
    modal: t("keybar.close"),
    confirm: t("keybar.decline"),
    input: quit,
    running: quit
  }
  const label = labels[bottomChromeKey]
  return label ? { key: "Esc", label, onPress: quittable ? pressQuit : undefined } : undefined
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

/**
 * One hotkey and its key bar entry: shown, bound and clickable only while `when` holds, so the three can't disagree.
 * `inBar: false` keeps a bound key out of the bar (the help screen lists it), for a line that has to fit in 78 columns.
 */
type KeyBinding = { letter: string; label: string; run: () => void; when: boolean; inBar?: boolean }

function buildKeyBarItems(
  hotkeyModifier: HotkeyModifier | undefined,
  modifierHeld: boolean,
  bindings: KeyBinding[],
  escItem?: KeyBarEntry
) {
  const label = modifierLabel(hotkeyModifier)
  return [
    { key: "PgUp/PgDn", label: t("keybar.scroll"), droppable: true },
    ...bindings
      .filter(binding => binding.when && binding.inBar !== false)
      .map(binding => ({
        key: `${label}+${binding.letter.toUpperCase()}`,
        // ‽ stands for whichever modifier it is; the help modal names it
        short: `‽+${binding.letter.toUpperCase()}`,
        label: binding.label,
        onPress: binding.run,
        lit: modifierHeld
      })),
    ...(escItem ? [escItem] : [])
  ]
}

/**
 * Chat chrome (Header/ChatViewport/UserInput/ConfirmCommand/PersonaPicker) shared by both backends. {@link LocalApp} and
 * {@link CloudApp} each drive their own agent hook and normalize its output into these props, so preferences,
 * sound/voice, the confirm-command flow, and persona switching are written once and behave identically regardless of
 * which backend is running.
 */
function Chrome({
  mode,
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
  personas = NO_PERSONAS,
  currentPersonaId,
  switchPersona,
  pendingCommand,
  runningCommand = false,
  resolvePending
}: Readonly<{
  /** Where the agent runs, shown as a badge in the header. */
  mode: "local" | "cloud"
  personaLabel: string
  model: string
  /**
   * Provider name shown after the model, e.g. "fireworks" → "Fireworks". Local only — cloud never exposes the resolved
   * provider.
   */
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
  /** `feedback` is what the user wrote instead of answering: a decline that tells the agent why. */
  resolvePending?: (approved: boolean, feedback?: string) => Promise<void>
}>) {
  const {
    thinking,
    toolDisplay,
    codePreviewLines,
    voice,
    hotkeyModifier,
    yolo,
    theme: initialTheme
  } = usePreferences(initialPreferences)
  const theme = useTheme(initialTheme)
  useHooks(events)
  const speaking = useVoice(events, capabilities.voice && voice, personaModels)
  const { columns, rows } = useWindowSize()
  const [modal, setModal] = useState<ModalName | null>(null)
  const codeView = useCodeView(codePreviewLines)

  const question = pendingQuestion(events, pending)
  const asking = Boolean(question)
  const choices = question?.options
  const bottomChromeKey = getBottomChromeKey(modal !== null, pendingCommand, runningCommand)
  const showConfirm = Boolean(pendingCommand && resolvePending)
  const showChoices = !showConfirm && Boolean(choices?.length)
  const [mic, setMic] = useState(false)
  const [promptDraft, setPromptDraft] = useState("")
  // While text is typed in a prompt (an approval, a question's options) Esc only empties the field
  const clearing = (showConfirm || showChoices) && promptDraft !== ""
  const quittable = isQuittable(bottomChromeKey) && !clearing
  const { armed: quitArmed, press: pressQuit } = useQuitGuard(quittable, pending || runningCommand)
  // "L" for help, not "H": Ctrl+H is byte-identical to Backspace (0x08), so it could
  // never fire under hotkeyModifier: "ctrl" — Ink has no way to tell the two apart.
  const bindings: KeyBinding[] = [
    {
      letter: "l",
      label: t("keybar.help"),
      when: true,
      run: () => setModal("help")
    },
    {
      letter: "p",
      label: t("keybar.persona"),
      when: capabilities.persona && !pending,
      run: () => setModal("persona")
    },
    // "R" for copy, not "C": Ctrl+C is reserved by Ink to quit the app, so under hotkeyModifier: "ctrl" it could never fire
    { letter: "r", label: t("keybar.copy"), when: true, inBar: false, run: () => uiEvents.emit("copy") },
    {
      letter: "e",
      label: t("keybar.expand"),
      when: codeView.canExpand,
      run: codeView.toggle
    },
    {
      letter: "o",
      label: t("keybar.command"),
      when: showConfirm && !runningCommand,
      run: () => setModal("command")
    }
  ]
  useModifierKeys(
    hotkeyModifier,
    Object.fromEntries(bindings.filter(binding => binding.when).map(binding => [binding.letter, binding.run]))
  )
  const modifierHeld = useModifierHeld(hotkeyModifier)
  const openDocs = () => {
    open(HELP_URL).catch(error => log.warn("Failed to open help URL", { error }))
  }
  const keyBarItems = buildKeyBarItems(
    hotkeyModifier,
    modifierHeld,
    bindings,
    escKeyBarItem(bottomChromeKey, quittable, clearing, quitArmed, pressQuit)
  )

  return (
    <ThemeProvider theme={themeFor(theme)}>
      <CodeViewContext.Provider value={codeView.view}>
        <Box flexDirection="column" width={columns} height={rows}>
          <Backdrop>
            <Header
              mode={mode}
              persona={personaLabel}
              model={model}
              provider={provider}
              promptTokens={promptTokens}
              contextWindow={contextWindow}
              currentTool={toolDisplay === "corner" ? currentTool : undefined}
              width={columns}
              profile={Bun.env.KAJA_PROFILE}
              yolo={yolo}
            />
            <DashedRule width={columns} />
            <ChatViewport
              events={events}
              thinking={thinking}
              partial={partial}
              pending={pending}
              bottomChromeKey={bottomChromeKey}
              toolDisplay={toolDisplay}
              currentTool={currentTool}
            />
            <DashedRule width={columns} />
            {showConfirm && pendingCommand && resolvePending && (
              <ConfirmCommand
                key="confirm-command"
                command={pendingCommand.command}
                description={pendingCommand.description}
                kind={pendingCommand.kind}
                running={runningCommand}
                speaking={speaking}
                personaModels={personaModels}
                onDraft={setPromptDraft}
                onResolve={(approved, feedback) => resolvePending(approved, feedback)}
              />
            )}
            {showChoices && choices && (
              <Prompt
                key="choices"
                spec={{
                  options: choices.map((label, index) => ({ kind: "choice", id: String(index), label })),
                  placeholder: t("input.askChoicesPlaceholder")
                }}
                asking
                speaking={speaking}
                personaModels={personaModels}
                history={history}
                mic={mic}
                onMicChange={setMic}
                onDraft={setPromptDraft}
                onResolve={result => void send(result.kind === "text" ? result.text : choices[Number(result.id)]!)}
              />
            )}
            {!showConfirm && !showChoices && (
              <UserInput
                key="user-input"
                pending={pending}
                speaking={speaking}
                asking={asking}
                placeholder={asking ? t("input.askPlaceholder") : undefined}
                send={send}
                history={history}
                personaModels={personaModels}
                mic={mic}
                onMicChange={setMic}
              />
            )}
            <DashedRule width={columns} />
            <KeyBar items={keyBarItems} width={columns} />
          </Backdrop>
          {modal === "help" && (
            <HelpModal
              modifier={modifierLabel(hotkeyModifier)}
              persona={capabilities.persona}
              docsUrl={HELP_URL}
              onOpenDocs={openDocs}
              onClose={() => setModal(null)}
            />
          )}
          {modal === "command" && pendingCommand && (
            <CommandModal command={pendingCommand.command} kind={pendingCommand.kind} onClose={() => setModal(null)} />
          )}
          {modal === "persona" && (
            <PersonaPicker
              key="persona-picker"
              personas={personas}
              currentPersonaId={currentPersonaId}
              onSelect={next => {
                switchPersona?.(next)
                setModal(null)
              }}
              onCancel={() => setModal(null)}
            />
          )}
        </Box>
      </CodeViewContext.Provider>
    </ThemeProvider>
  )
}

function LocalApp({
  initialPreferences,
  models = NO_MODELS,
  personas,
  openaiApiModel,
  tools,
  ensureTools,
  safeCommands,
  initialSession,
  promptHistory,
  notices
}: Readonly<{
  initialPreferences?: KajaPreferences
  models?: CliResolvedModel[]
  personas: Persona[]
  openaiApiModel: string
  tools: Tool[]
  /** Connects the active persona's MCP abilities (see Agent.ensureTools). */
  ensureTools?: (abilities?: string[], personaId?: string) => Promise<Tool[]>
  /** Whole-command patterns that run without asking, from commands.toml. */
  safeCommands?: RegExp[]
  initialSession?: PersistedSession
  promptHistory?: string[]
  notices?: string[]
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
    describer,
    compactAt,
    tools,
    ensureTools,
    safeCommands,
    yolo: initialPreferences?.yolo,
    personas,
    models,
    notices,
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
    fireHook("persona_switch", {
      title: t("cli.personaSwitchedTitle"),
      text: t("cli.personaSwitchedMessage", { label: target.label })
    })
  }

  const lastEvent = events.at(-1)
  const pendingEvent =
    !pending && (lastEvent?.type === "confirm_command" || lastEvent?.type === "confirm_tool") ? lastEvent : undefined
  const pendingCommand = pendingEvent && confirmPrompt(pendingEvent)
  const resolvePending = pendingEvent
    ? (approved: boolean, feedback?: string) =>
        pendingEvent.type === "confirm_command"
          ? resolveCommand(pendingEvent.command, approved, feedback)
          : resolveToolApproval(pendingEvent.name, pendingEvent.arguments, approved, feedback)
    : undefined
  const provider = models.find(m => m.model === displayModel)?.provider

  return (
    <Chrome
      mode="local"
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
  token,
  computer,
  onSignedOut
}: Readonly<{
  initialPreferences?: KajaPreferences
  apiUrl: string
  token: string
  computer?: Computer | Promise<Computer | undefined>
  onSignedOut?: () => void
}>) {
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
    localApproval,
    promptTokens,
    contextWindow
  } = useCloudAgent({
    baseUrl: apiUrl,
    getToken: () => Promise.resolve(token),
    yolo: initialPreferences?.yolo,
    computer,
    onSignedOut
  })

  const lastEvent = events.at(-1)
  // A call on this computer asks while its turn is still running; a cloud approval only once the turn ended.
  const cloudEvent = !pending && lastEvent?.type === "confirm_tool" ? lastEvent : undefined
  const pendingEvent = localApproval?.event ?? cloudEvent
  let resolvePending: ((approved: boolean, feedback?: string) => Promise<void>) | undefined
  if (localApproval)
    resolvePending = (approved, feedback) => Promise.resolve(localApproval.resolve(feedback ? { feedback } : approved))
  else if (cloudEvent) resolvePending = resolveToolApproval

  return (
    <Chrome
      mode="cloud"
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
      resolvePending={resolvePending}
    />
  )
}

type LocalAppProps = Readonly<{
  mode: "local"
  initialPreferences?: KajaPreferences
  models?: CliResolvedModel[]
  personas: Persona[]
  openaiApiModel: string
  tools: Tool[]
  /** Connects the active persona's MCP abilities (see Agent.ensureTools). */
  ensureTools?: (abilities?: string[], personaId?: string) => Promise<Tool[]>
  /** Whole-command patterns that run without asking, from commands.toml. */
  safeCommands?: RegExp[]
  /** A persisted session to continue (--continue / --session <id>). */
  initialSession?: PersistedSession
  /** Past prompts across all sessions for ↑/↓ recall, newest first. */
  promptHistory?: string[]
  /** Startup notices shown in the chat before the first message, e.g. abilities left off. */
  notices?: string[]
}>

type CloudAppProps = Readonly<{
  mode: "cloud"
  initialPreferences?: KajaPreferences
  apiUrl: string
  token: string
  /** This computer, when cloud turns may use it (see lib/cloud/computer.ts); the first turn waits for it to open. */
  computer?: Computer | Promise<Computer | undefined>
  /** The API refused the token mid-chat (expired or revoked): forget it, so the next start signs in again. */
  onSignedOut?: () => void
}>

/**
 * The CLI's chat screen, backed by either the local {@link Agent} loop (`mode: "local"`, full tools/persona
 * catalog/run_command) or cloud Nasi over SSE (`mode: "cloud"`, no MCP, no run_command — cloud never emits those — but
 * the user's HTTP tools may ask for approval). Both render the same chat chrome via {@link Chrome}, including the
 * configurable-modifier keybar (help / persona picker; see use-modifier-keys.ts).
 */
export default function App(props: LocalAppProps | CloudAppProps) {
  return <ModalHost>{props.mode === "local" ? <LocalApp {...props} /> : <CloudApp {...props} />}</ModalHost>
}
