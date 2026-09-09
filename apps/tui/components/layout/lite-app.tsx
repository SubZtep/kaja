import { Box, useWindowSize } from "ink"
import { useRemoteAgent } from "../../hooks/use-remote-agent"
import { t } from "../../lib/i18n"
import { ChatViewport } from "./chat-viewport"
import { Header } from "./header"
import { UserInput } from "./user-input"

/** kaja-lite's counterpart to App: same chat chrome (Header/ChatViewport/UserInput), backed by hosted Nasi over SSE instead of the local Agent loop. No persona/model switching, no run_command confirm, no MCP — hosted never emits those. */
export default function LiteApp({ apiUrl, token }: Readonly<{ apiUrl: string; token: string }>) {
  const { model, persona, events, partial, pending, send, promptTokens } = useRemoteAgent({
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
      <ChatViewport events={events} thinking={true} partial={partial} pending={pending} sounds={false} />
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
