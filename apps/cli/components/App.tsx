import { Box, Text, useApp } from "ink"
import { useEffect, useState } from "react"
import { apiBaseUrl } from "../lib/clients"
import { Auth } from "./Auth"
import { Dashboard } from "./Dashboard"
import { ErrorScreen } from "./ErrorScreen"
import { Logo } from "./Logo"
import { NodeSetup } from "./NodeSetup"

type AppState =
  | { phase: "init" }
  | { phase: "auth" }
  | { phase: "node_setup" }
  | { phase: "connecting" }
  | { phase: "running"; nodeId: string; nodeName: string }
  | { phase: "error"; error: Error }

export function App() {
  const { exit } = useApp()
  const [state, setState] = useState<AppState>({ phase: "init" })

  // Set API URL as environment variable
  useEffect(() => {
    process.env.API_URL = apiBaseUrl
  }, [])

  // Auto-transition from init to auth
  useEffect(() => {
    if (state.phase === "init") {
      const timer = setTimeout(() => {
        setState({ phase: "auth" })
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [state.phase])

  // Handle phase transitions
  const handleAuthComplete = () => {
    setState({ phase: "node_setup" })
  }

  const handleNodeSetupComplete = (_nodeName: string) => {
    setState({ phase: "connecting" })
    // Will transition to running from NodeSetup component
  }

  const handleConnected = (nodeId: string, nodeName: string) => {
    setState({ phase: "running", nodeId, nodeName })
  }

  const handleError = (error: Error) => {
    setState({ phase: "error", error })
  }

  const handleQuit = () => {
    exit()
  }

  return (
    <Box flexDirection="column">
      <Logo />

      {state.phase === "init" && (
        <Box flexDirection="column">
          <Text>Initializing...</Text>
        </Box>
      )}

      {state.phase === "auth" && <Auth onComplete={handleAuthComplete} onError={handleError} />}

      {state.phase === "node_setup" && (
        <NodeSetup onComplete={handleNodeSetupComplete} onConnected={handleConnected} onError={handleError} />
      )}

      {state.phase === "connecting" && (
        <Box flexDirection="column">
          <Text>Connecting to server...</Text>
        </Box>
      )}

      {state.phase === "running" && <Dashboard nodeId={state.nodeId} nodeName={state.nodeName} onQuit={handleQuit} />}

      {state.phase === "error" && <ErrorScreen error={state.error} onRetry={() => setState({ phase: "init" })} />}
    </Box>
  )
}
