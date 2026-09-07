import type { Tool } from "@kaja/nasi"
import { Box, useWindowSize } from "ink"
import { useRemoteAgent } from "../../hooks/use-remote-agent"
import { t } from "../../lib/i18n"
import { StartupPanel } from "../startup-panel"
import { ChatViewport } from "./chat-viewport"
import { Header } from "./header"
import { UserInput } from "./user-input"

/** Wraps a bare tool name in just enough of a `Tool` shape for `StartupPanel`'s display-only `toolName()` lookup — hosted mode only ever gets tool names from `/nasi/info`, never real executable tools. */
function displayTool(name: string): Tool<unknown> {
  return {
    definition: { type: "function", function: { name, parameters: {} } },
    execute: async () => ""
  }
}

/** kaja-lite's counterpart to App: same chat chrome (Header/ChatViewport/UserInput), backed by hosted Nasi over SSE instead of the local Agent loop. No persona/model switching, no run_command confirm, no MCP — hosted never emits those. */
export default function LiteApp({ apiUrl, token }: Readonly<{ apiUrl: string; token: string }>) {
  const { model, persona, tools, events, partial, pending, send, promptTokens } = useRemoteAgent({
    baseUrl: apiUrl,
    getToken: async () => token
  })
  const { columns, rows } = useWindowSize()

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Header
        persona={persona?.label ?? t("cli.connecting")}
        model={model}
        promptTokens={promptTokens}
        width={columns}
      />
      <ChatViewport
        events={events}
        thinking={true}
        partial={partial}
        pending={pending}
        sounds={false}
        startupPanel={
          <StartupPanel
            models={[{ id: model, model, task: "chat", baseUrl: "", provider: "" }]}
            activeModelId={model}
            sessionCount={0}
            memoryNoteCount={0}
            tools={tools.map(displayTool)}
            skipAvailabilityCheck
          />
        }
      />
      <UserInput
        key="user-input"
        pending={pending}
        speaking={false}
        send={send}
        menuItems={[]}
        onMenuSelect={() => {}}
      />
    </Box>
  )
}
