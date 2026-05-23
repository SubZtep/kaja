import { Box, Text } from "ink"
import Spinner from "ink-spinner"
import TextInput from "ink-text-input"
import { useEffect, useState } from "react"
import { kaja } from "../lib/clients"
import { setConfig } from "../lib/kaja-sdk"

interface NodeSetupProps {
  onComplete: (nodeName: string) => void
  onConnected: (nodeId: string, nodeName: string) => void
  onError: (error: Error) => void
}

export function NodeSetup({ onComplete, onConnected, onError }: NodeSetupProps) {
  const [nodeName, setNodeName] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)
  const [needsName, setNeedsName] = useState(false)

  useEffect(() => {
    // Check if node already has a config
    if (kaja.config.id) {
      // Already configured, connect immediately
      connectNode(kaja.config.name)
    } else {
      // Need to ask for node name
      setNeedsName(true)
      setNodeName(kaja.config.name) // Set default
    }
  }, [])

  async function connectNode(name: string) {
    setIsConnecting(true)
    onComplete(name)

    try {
      kaja.setConfig({ name })
      const nodeId = await kaja.connectNode()

      if (!nodeId) {
        throw new Error("Failed to connect to server")
      }

      // Save node ID to config
      await setConfig({ ...kaja.config, id: nodeId })

      onConnected(nodeId, name)
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)))
    }
  }

  const handleSubmit = (value: string) => {
    if (value.length < 2) {
      onError(new Error("Node name must be at least 2 characters"))
      return
    }
    connectNode(value)
  }

  if (!needsName && !isConnecting) {
    return (
      <Box>
        <Text>
          <Spinner type="dots" />
          {" Loading..."}
        </Text>
      </Box>
    )
  }

  if (isConnecting) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text>
          <Spinner type="dots" />
          {" Connecting to server..."}
        </Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text>What is your node's name?</Text>
      <Box marginTop={1}>
        <Text dimColor>› </Text>
        <TextInput value={nodeName} onChange={setNodeName} onSubmit={handleSubmit} placeholder={kaja.config.name} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press Enter to continue</Text>
      </Box>
    </Box>
  )
}
