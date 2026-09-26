import type { Dataset, Persona, SamplingParams } from "@kaja/schema/cli"
import type { CliResolvedModel } from "@kaja/schema/config"
import type OpenAI from "openai"
import type { NasiStore } from "../store/types"
import { samplingOf } from "./persona"
import { type Tool, tool } from "./tools"

export { LOCAL_OWNER_CTX, type Tool, type ToolContext, ToolError, type ToolResult, tool } from "./tools"

/** Host-injected bits for system prompt assembly — never read from settings.toml. */
export type PromptContext = {
  /** Override the default OS/home line. Callers that are not a user machine should describe their environment. */
  environment?: string
  /** Override the default ask_user tool contract, which assumes a terminal. Hosts with a chat UI should describe that instead. */
  askUserInstruction?: string
  replyLanguageInstruction?: string
  /** How replies should read where the human sees them, e.g. {@link TELEGRAM_CHANNEL_INSTRUCTION}; unset means no guidance. */
  channelInstruction?: string
  loadStickyNotes?: () => Promise<[string, { content: string }][]>
  loadDataset?: (topic: string) => Promise<{ label: string } | undefined>
  /** Every dataset by topic; profile ones feed the "About the user" section. Defaults to the host's registered loaders. */
  loadDatasets?: () => Promise<Map<string, Dataset>>
}

/**
 * A model plus the tools it's allowed to call.
 */
export class Agent {
  name: string
  model: string
  client: OpenAI
  tools: Tool<any>[]
  instructions?: string
  sampling?: SamplingParams
  /** Topic id of the dataset this agent's persona is bound to collecting, if any. */
  dataset?: string
  /** Full persona roster, so the model can switch mid-conversation via switchPersonaTool. */
  personas: Persona[]
  /** Resolved models, so a persona swap can honor the target's pinned `model` via setModel. */
  models: CliResolvedModel[]
  /** Id of the currently adopted persona, if any — kept in sync by {@link applyPersona}. */
  personaId?: string
  promptContext: PromptContext
  /** Builds a client for a resolved model. Required for persona-pinned model swaps. */
  createClient?: (model: CliResolvedModel) => OpenAI
  store?: NasiStore
  /** The current model's context window in tokens; when unset, {@link run} resolves it from the matching {@link models} entry. */
  contextWindow?: number
  /** Writes compaction summaries (the summarize task's model); defaults to this agent's own chat model. */
  summarizer?: { client: OpenAI; model: string; contextWindow?: number }
  /** Share of the context window (0-1) at which a round compacts the conversation first; defaults to 0.8. */
  compactAt?: number

  constructor(config: {
    name?: string
    model: string
    client?: OpenAI
    tools: Tool<any>[]
    instructions?: string
    sampling?: SamplingParams
    dataset?: string
    personas?: Persona[]
    models?: CliResolvedModel[]
    personaId?: string
    promptContext?: PromptContext
    createClient?: (model: CliResolvedModel) => OpenAI
    store?: NasiStore
    contextWindow?: number
    summarizer?: { client: OpenAI; model: string; contextWindow?: number }
    compactAt?: number
  }) {
    this.name = config.name ?? "Assistant"
    this.model = config.model
    this.client = config.client as OpenAI
    this.tools = config.tools
    this.instructions = config.instructions
    this.sampling = config.sampling
    this.dataset = config.dataset
    this.personas = config.personas ?? []
    this.models = config.models ?? []
    this.personaId = config.personaId
    this.promptContext = config.promptContext ?? {}
    this.createClient = config.createClient
    this.store = config.store
    this.contextWindow = config.contextWindow
    this.summarizer = config.summarizer
    this.compactAt = config.compactAt
  }

  /** Point the agent at another model, swapping the client when {@link createClient} is set. */
  setModel(model: CliResolvedModel) {
    this.model = model.model
    this.contextWindow = model.contextWindow
    if (this.createClient) this.client = this.createClient(model)
  }
}

export const ASK_USER_TOOL = "ask_user"
export const RUN_COMMAND_TOOL = "run_command"
export const DATASET_INFO_TOOL = "dataset_info"
export const SWITCH_PERSONA_TOOL = "switch_persona"
export const REMEMBER_NOTE_TOOL = "remember_note"

export const askUserTool = tool<{ question: string; note?: string }>({
  name: ASK_USER_TOOL,
  description:
    "Ask the human a question and wait for their reply. Use this when you need " +
    "information only they can provide, or when you're done with your current " +
    "thought and it's their turn (e.g. asking your next yes/no question in a " +
    "game). Don't use this just to acknowledge or restate something.",
  parameters: {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "The question to ask the human."
      },
      note: {
        type: "string",
        description:
          "Optional short reaction to their previous answer, shown separately from " +
          "the question (e.g. 'Not alive — got it.'). Never repeat or preview the " +
          "question itself here."
      }
    },
    required: ["question"]
  },
  execute: async () => {
    throw new Error(`${ASK_USER_TOOL} should be intercepted by run(), not executed`)
  }
})

export const runCommandTool = tool<{
  command: string
  description: string
  mutates: boolean
}>({
  name: RUN_COMMAND_TOOL,
  description:
    "Propose a shell command to run on the user's computer. Read-only " +
    "commands (mutates: false) run immediately; others require human " +
    "approval first. Use for actions like playing a sound, converting " +
    "media, or invoking a CLI tool.",
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "The shell command to run" },
      description: {
        type: "string",
        description: "One short sentence explaining what this command does, shown to the human alongside it"
      },
      mutates: {
        type: "boolean",
        description:
          "Whether this command changes any state — files, git history, " +
          "installed packages, system config, network resources, etc. " +
          "false only for purely read-only commands (e.g. ls, cat, git " +
          'status, python3 -c "print(...)"). When unsure, say true.'
      }
    },
    required: ["command", "description", "mutates"]
  },
  execute: async () => {
    throw new Error(`${RUN_COMMAND_TOOL} should be intercepted by run(), not executed`)
  }
})

export const switchPersonaTool = tool<{ persona: string; reason?: string }>({
  name: SWITCH_PERSONA_TOOL,
  description:
    "Switch your own persona when the conversation clearly calls for a " +
    "different one (see ## Personas in your system prompt). The " +
    "conversation continues uninterrupted; only your role, style, and " +
    "focus change.",
  parameters: {
    type: "object",
    properties: {
      persona: {
        type: "string",
        description: "Id of the persona to adopt"
      },
      reason: {
        type: "string",
        description: "One short sentence on why this persona fits now"
      }
    },
    required: ["persona"]
  },
  execute: async () => {
    throw new Error(`${SWITCH_PERSONA_TOOL} should be intercepted by run(), not executed`)
  }
})

/**
 * Applies a persona's fields to an agent. Swaps the model only when the
 * persona pins one and the host provided {@link Agent.setModel} via the
 * returned model — callers that want a client swap must call setModel themselves
 * after looking up the model. Here we only set model id if we have a matching
 * resolved model AND a way to build a client; hosts pass models[] and a
 * `createClient` on the agent when they want auto-swap.
 */
export function applyPersona(agent: Agent, persona: Persona) {
  agent.personaId = persona.id
  agent.instructions = persona.instructions
  agent.sampling = samplingOf(persona)
  agent.dataset = persona.dataset
  if (persona.models?.chat) {
    const model = agent.models.find(m => m.id === persona.models!.chat)
    if (model) agent.setModel(model)
  }
}

/** What one model round cost, recorded beside the assistant message it produced; `at` is that message's row index (the system prompt not counted). */
export type StepStat = {
  at: number
  /** The provider-reported model that served the round, else the requested one. */
  model?: string
  /** The persona active when the round ran. */
  persona?: string
  promptTokens?: number
  completionTokens?: number
  latencyMs: number
  finishReason?: string
}

/** How a tool call went: `ok`/`error` when it ran, `declined` (the human said no) or `skipped` (they typed instead). Unset when a person or a client answered it. */
export type CallStatus = "ok" | "error" | "declined" | "skipped"

export type CallStat = { status?: CallStatus; approval?: "approved" | "declined"; durationMs?: number }

/** What one model call besides the conversation's own rounds cost: a summary written for compaction, condensing or the summarize tool. */
export type ModelCallStat = {
  kind: "compact" | "condense" | "summarize"
  /** The provider-reported model, else the requested one. */
  model: string
  promptTokens?: number
  completionTokens?: number
  latencyMs: number
}

/** Numbers {@link run} and the hosts record as they go; a store takes them off the session when it saves (see `clearTelemetry`). Calls are keyed by the provider's call id. */
export type SessionTelemetry = { steps: StepStat[]; calls: Record<string, CallStat>; modelCalls?: ModelCallStat[] }

/** Conversation state threaded through repeated {@link run} calls. */
export type Session = {
  messages: import("openai/resources/chat/completions").ChatCompletionMessageParam[]
  telemetry?: SessionTelemetry
  pendingAskUserId?: string
  pendingRunCommandId?: string
  pendingClientToolCallId?: string
  /** A tool call waiting on the human's approval (see `Tool.approval`); the host answers it by running the tool itself. */
  pendingToolApprovalId?: string
  /** Once compacted: the latest summary, which stands in for `messages` before index `from` in what the model is sent. */
  summary?: { text: string; from: number }
  /** Condensed versions of oversized tool results, by call id, sent to the model in place of the full output. */
  toolSummaries?: Record<string, string>
}

export function createSession(): Session {
  return { messages: [] }
}

export type AgentDelta = {
  type: "delta"
  channel: "reasoning" | "content"
  text: string
}

export type AgentEvent =
  | AgentDelta
  | { type: "reasoning"; text: string }
  | { type: "message"; content: string }
  | { type: "tool_call"; name: string; arguments: string }
  | { type: "tool_image"; path: string; mimeType: string }
  | { type: "display_image"; url: string; alt: string }
  | { type: "ask_user"; question: string; note?: string }
  | { type: "confirm_command"; command: string; description: string }
  | { type: "client_tool_call"; name: string; arguments: string }
  /** `id` is the pending call's id (`session.pendingToolApprovalId`), for hosts that correlate the answer themselves. */
  | { type: "confirm_tool"; id: string; name: string; arguments: string; summary: string }
  | { type: "persona_switch"; personaId: string; label: string }
  | { type: "final"; content: string | null }
  /** The conversation was compacted before a round; `dropped` when the summarizer failed and older messages were cut without one. */
  | { type: "compacted"; beforeTokens: number; afterTokens: number; dropped: boolean }
  /** A tool result too big for the window was condensed before a round; the model is sent the shorter version. */
  | { type: "condensed"; tool: string; beforeTokens: number; afterTokens: number }
  /** `contextWindow` is the current model's size in tokens, when known, so hosts can show how full it is. */
  | { type: "usage"; promptTokens?: number; model?: string; contextWindow?: number }

export type FinalizedAgentEvent = Exclude<AgentEvent, AgentDelta>
