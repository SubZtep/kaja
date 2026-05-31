import { error, info, trace } from "@kaja/logger"
import { useMutation } from "@tanstack/react-query"
import { Box, Text } from "ink"
import TextInput from "ink-text-input"
import { useEffect } from "react"
import { sdk } from "../lib/sdk"
import { useStore } from "../store"

export function NodeSetup() {
  const setNodeId = useStore(state => state.setNodeId)
  const nodeName = useStore(state => state.nodeName)
  const setNodeName = useStore(state => state.setNodeName)

  const { mutate: connectNode, isPending } = useMutation({
    mutationFn: () => sdk.nodes.connect({ name: nodeName }),
    onMutate: () => trace("Connecting", { name: nodeName }),
    onSuccess: res => {
      info("Connected with node ID", res)
      setNodeId(res.nodeId)
    },
    onError: err => error("Node setup failed", { error: err })
  })

  const registerNode = async () => {
    if (nodeName.trim().length > 1) {
      setNodeName(nodeName)
      connectNode()
    } else {
      throw new Error("Node name cannot be empty.")
    }
  }

  useEffect(() => {
    if (nodeName.trim().length > 4) {
      // TODO: check if exists (?)
      registerNode()
    }
  }, [])

  return (
    <Box flexDirection="column" gap={1}>
      <Text>What is your node's name?</Text>
      <Box>
        <Text dimColor>› </Text>
        {isPending ? (
          <Text>{nodeName}</Text>
        ) : (
          <TextInput value={nodeName} onChange={setNodeName} onSubmit={registerNode} placeholder="Machine's name" />
        )}
      </Box>
      <Box>
        <Text dimColor>Press Enter to continue</Text>
      </Box>
    </Box>
  )
}
