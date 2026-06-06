import { error } from "@kaja/logger"
import { useMutation } from "@tanstack/react-query"
import { Box, Text, useApp, useInput } from "ink"
import { useEffect, useRef, useState } from "react"
import { sdk } from "../lib/sdk"
import { useStore } from "../store"
import { CommandExecutor } from "./CommandExecutor"

export default function NodeRunner() {
  const { exit } = useApp()
  const nodeId = useStore(state => state.nodeId!)
  const nodeName = useStore(state => state.nodeName)
  const [tickCount, setTickCount] = useState(0)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const abortControllerRef = useRef<AbortController>(new AbortController())
  const isShuttingDown = useRef(false)

  const heartbeatMutation = useMutation({
    mutationFn: () => sdk.nodes.heartbeat({ nodeId, status: "idle" }, { signal: abortControllerRef.current.signal }),
    onError: err => {
      if (!isShuttingDown.current) {
        error("Heartbeat failed", { error: err })
      }
    }
  })

  useEffect(() => {
    if (!nodeId || !nodeName) {
      throw new Error("Node ID or name is missing. Please complete the setup.")
    }
  }, [nodeId, nodeName])

  useInput(async (input, key) => {
    if ((key.ctrl && input === "c") || input === "q") {
      // Prevent multiple shutdowns
      if (isShuttingDown.current) return
      isShuttingDown.current = true

      // Clear the heartbeat interval first
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }

      // Abort any pending heartbeat requests
      abortControllerRef.current.abort()

      // Send disconnect request with timeout
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Disconnect timeout")), 3000)
        )

        await Promise.race([sdk.nodes.disconnect({ nodeId }), timeoutPromise])
      } catch {
        // Suppress errors during shutdown - we're exiting anyway
        // The node will be marked as inactive by the scheduler after timeout
      }

      exit()
    }
  })

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isShuttingDown.current) {
        setTickCount(count => count + 1)
        heartbeatMutation.mutate()
      }
    }, 5000)

    intervalRef.current = interval

    return () => {
      clearInterval(interval)
      intervalRef.current = null
    }
  }, [])

  return (
    <Box flexDirection="column">
      <Text>
        Node is running: {nodeName} (ticks: {tickCount})
      </Text>
      <Text dimColor>Press 'q' or Ctrl+C to quit</Text>
      <CommandExecutor nodeId={nodeId} />
    </Box>
  )
}
