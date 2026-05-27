import { useMutation } from "@tanstack/react-query"
import { Box, Text } from "ink"
import TextInput from "ink-text-input"
import { useState } from "react"
import { connectNodeRequest } from "../lib/api"
import { logger } from "../lib/logger"
// import { kaja } from "../lib/clients"
// import { setConfig } from "../lib/kaja-sdk"
import { useStore } from "../store"

// interface NodeSetupProps {
//   onComplete: (nodeName: string) => void
//   onConnected: (nodeId: string, nodeName: string) => void
//   onError: (error: Error) => void
// }

// export function NodeSetup({ onComplete, onConnected, onError }: NodeSetupProps) {
export function NodeSetup() {
  const setNodeId = useStore(state => state.setNodeId)
  const nodeName = useStore(state => state.nodeName)
  const setNodeName = useStore(state => state.setNodeName)
  const [name, setName] = useState(nodeName)

  const { mutate: connectNode, isPending } = useMutation({
    mutationFn: () => connectNodeRequest({ name: nodeName }),
    onMutate: () => logger.trace({ name: nodeName }, "Connecting"),
    onSuccess: res => {
      logger.info(res, "Connected with node ID")
      setNodeId(res.nodeId)
    },
    onError: error => logger.error({ error }, "Node setup failed")
  })

  // useEffect(() => {
  //   // Check if node already has a config
  //   if (kaja.config.id) {
  //     // Already configured, connect immediately
  //     connectNode(kaja.config.name)
  //   } else {
  //     // Need to ask for node name
  //     setNeedsName(true)
  //     setNodeName(kaja.config.name) // Set default
  //   }
  // }, [])

  // async function connectNode(name: string) {
  //   setIsConnecting(true)
  //   // onComplete(name)

  //   try {
  //     kaja.setConfig({ name })
  //     const nodeId = await kaja.connectNode()

  //     if (!nodeId) {
  //       throw new Error("Failed to connect to server")
  //     }

  //     // Save node ID to config
  //     await setConfig({ ...kaja.config, id: nodeId })

  //     // onConnected(nodeId, name)
  //   } catch (error) {
  //     const message = error instanceof Error ? error.message : String(error)
  //     throw new Error("boo " + message)
  //   }
  // }

  const submitName = async (name: string) => {
    const trimmedName = name.trim()
    if (trimmedName.length === 0) {
      throw new Error("Node name cannot be empty.")
    }
    setNodeName(trimmedName)
    connectNode()
    // connectNode()
    // console.log(`submit ${name}`)
    // kaja.setConfig({ name })
  }

  // if (!needsName && !isConnecting) {
  //   return <Text>Loading...</Text>
  // }

  // if (isConnecting) {
  //   return <Text>Connecting to server...</Text>
  // }

  return (
    <Box flexDirection="column" gap={1}>
      <Text>What is your node’s name?</Text>
      <Box>
        <Text dimColor>› </Text>
        {isPending ? (
          <Text>{name}</Text>
        ) : (
          <TextInput value={name} onChange={setName} onSubmit={name => submitName(name)} placeholder="Machine’s name" />
        )}
      </Box>
      <Box>
        <Text dimColor>Press Enter to continue</Text>
      </Box>
    </Box>
  )
}
