export {
  Agent,
  type AgentDelta,
  type AgentEvent,
  ASK_USER_TOOL,
  applyPersona,
  askUserTool,
  createSession,
  DATASET_INFO_TOOL,
  type FinalizedAgentEvent,
  type PromptContext,
  REMEMBER_NOTE_TOOL,
  RUN_COMMAND_TOOL,
  runCommandTool,
  type Session,
  SWITCH_PERSONA_TOOL,
  switchPersonaTool
} from "./agent/agent"
export { isDangerousCommand } from "./agent/command-risk"
export { categorizeError, type ErrorCategory } from "./agent/error-category"
export {
  type GeoLocation,
  type GeoLookupConfig,
  lookupMyLocation,
  resetLocationCache,
  tryLookupMyLocation
} from "./agent/geo"
export { samplingOf } from "./agent/persona"
export { run } from "./agent/run"
export { runShellCommand } from "./agent/run-command"
export { applyPersonaToMessages, buildSystemPrompt, defaultEnvironmentInstructions } from "./agent/system-prompt"
export { LOCAL_OWNER_CTX, type Tool, type ToolContext, ToolError, type ToolResult, tool, toolName } from "./agent/tools"
export { connectMcpServer } from "./mcp/client"
export {
  createOpenAIClient,
  FREE_CHAT_API_KEY,
  FREE_CHAT_BASE_URL,
  FREE_CHAT_MODEL_ID,
  FREE_CHAT_PROVIDER,
  KAJA_MODEL_HEADER,
  KAJA_ZEN_KEY_HEADER,
  noteServedModel,
  takeLastServedModel
} from "./models/client"
export { clientFromResolved, Nasi, type NasiOpenOptions, type NasiTurnInput } from "./nasi"
export { loadDataset, loadDatasets, setDatasetLoaders } from "./personas"
export { loadPluginTools } from "./plugin/plugin-tools"
export { fetchPublicHttp, UnsafeUrlError } from "./security/ssrf"
export {
  closeStore,
  createSessionRow,
  type DatasetAnswer,
  deleteSessionRow,
  forgetNotes,
  getActiveStorePath,
  getDb,
  latestDatasetVersion,
  listAllDatasetAnswers,
  listDatasetVersionsSummary,
  listSessions,
  loadDatasetAnswers,
  loadDatasetVersionCompletedAt,
  loadLatestSessionRow,
  loadLatestSessionRowForOwner,
  loadMemory,
  loadPromptHistory,
  loadSessionRow,
  markDatasetVersionComplete,
  noteHeader,
  openStore,
  SCHEMA_VERSION,
  saveDatasetAnswer,
  saveMemory,
  setActiveStorePath,
  updateSessionRow
} from "./store"
export { currentTimeTool } from "./tools/builtin/current-time"
export { datasetInfoTool } from "./tools/builtin/dataset-info"
export { fetchUrlTool } from "./tools/builtin/fetch-url"
export { generateImageTool } from "./tools/builtin/generate-image"
export { listFilesTool } from "./tools/builtin/list-files"
export { forgetNoteTool, listNotesTool, recallMemoryTool, rememberNoteTool } from "./tools/builtin/memory"
export { readFileTool } from "./tools/builtin/read-file"
export { rerankTool } from "./tools/builtin/rerank"
export { summarizeTool } from "./tools/builtin/summarize"
export { viewImageTool } from "./tools/builtin/view-image"
export { webSearchTool } from "./tools/builtin/web-search"
export { getToolDeps, type NasiToolDeps, setToolDeps } from "./tools/deps"
export { type CreateToolsOptions, createTools, HOSTED_SAFE, LOCAL_ONLY, type NasiProfile } from "./tools/registry"
