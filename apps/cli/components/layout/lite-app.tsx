import { Box, Text, useWindowSize } from "ink"
import { useRemoteAgent } from "../../hooks/use-remote-agent"
import { ChatViewport } from "./chat-viewport"
import { Header } from "./header"
import { UserInput } from "./user-input"

/** kaja-lite's counterpart to App: same chat chrome (Header/ChatViewport/UserInput), backed by hosted Nasi over SSE instead of the local Agent loop. No persona/model switching, no run_command confirm, no MCP — hosted never emits those. */
export default function LiteApp({ apiUrl, token }: Readonly<{ apiUrl: string; token: string }>) {
  const { model, events, partial, pending, send, promptTokens } = useRemoteAgent({
    baseUrl: apiUrl,
    getToken: async () => token
  })
  const { columns, rows } = useWindowSize()

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Header persona="kaja-lite" model={model} promptTokens={promptTokens} width={columns} />
      <ChatViewport
        events={events}
        thinking={true}
        partial={partial}
        pending={pending}
        sounds={false}
        startupPanel={
          <Box flexDirection="column" paddingX={1}>
            <Text dimColor>Connected to {apiUrl}</Text>
            <Text dimColor>Say hello to get started.</Text>
          </Box>
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
