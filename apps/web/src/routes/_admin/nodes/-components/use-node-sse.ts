import { error, trace } from "@kaja/logger"
import type { Node } from "@kaja/schemas"
import { nodeSchema } from "@kaja/schemas"
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import { z } from "zod"

const ConnectedEventSchema = z.object({
  type: z.literal("connected"),
  node: nodeSchema.optional()
})

const NodeUpdateEventSchema = z.object({
  type: z.enum(["connected", "heartbeat", "disconnect", "status-change"]),
  node: nodeSchema
})

const SSEEventSchema = z.union([ConnectedEventSchema, NodeUpdateEventSchema])

/**
 * Hook to listen for real-time node updates via SSE
 */
export function useNodeSSE(apiUrl: string, setIsLive?: (live: boolean) => void) {
  const queryClient = useQueryClient()
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const retryCountRef = useRef(0)
  const setIsLiveRef = useRef(setIsLive)

  // Keep setIsLive ref updated
  useEffect(() => {
    setIsLiveRef.current = setIsLive
  }, [setIsLive])

  useEffect(() => {
    let isSubscribed = true

    function connect() {
      if (!isSubscribed) return

      // Fix #1: Close existing connection before creating new one (prevents memory leak)
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }

      // Fix #2: Clear any pending reconnect timeout (prevents multiple concurrent reconnects)
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }

      // Create SSE connection
      const eventSource = new EventSource(`${apiUrl}/nodes/stream`, {
        withCredentials: true
      })
      eventSourceRef.current = eventSource

      eventSource.addEventListener("node-update", (event: MessageEvent) => {
        // Fix #3: Add try/catch for JSON.parse
        let rawData: unknown
        try {
          rawData = JSON.parse(event.data)
        } catch (err) {
          error("Failed to parse SSE event data:", { error: err })
          return
        }

        // Fix #7: Validate data with Zod schema
        const parseResult = SSEEventSchema.safeParse(rawData)
        if (!parseResult.success) {
          error("Invalid SSE event data:", { issues: parseResult.error.issues })
          return
        }

        const data = parseResult.data

        // Ignore initial connection events without node data
        if (data.type === "connected" && !data.node) return

        // Update the nodes query cache
        queryClient.setQueryData(["nodes"], (oldData: Node[] | undefined) => {
          // At this point, data is either NodeUpdateEventSchema or ConnectedEventSchema with a node
          // Type guard: ensure we have a node to work with
          if (!("node" in data) || !data.node) {
            return oldData
          }

          const { node, type } = data

          // Initialize with empty array if cache is not yet populated
          const currentData = oldData ?? []

          // Update or add the node in the list
          const existingIndex = currentData.findIndex(n => n.id === node.id)

          if (existingIndex >= 0) {
            // Update existing node (handles reconnects: inactive → idle)
            const newData = [...currentData]
            newData[existingIndex] = node
            return newData
          }

          // Add new node (for connected, heartbeat events on new nodes)
          if (type === "connected" || type === "heartbeat") {
            return [...currentData, node]
          }

          return currentData
        })
      })

      eventSource.addEventListener("open", () => {
        // Fix #4: Use ref instead of direct call
        setIsLiveRef.current?.(true)
        // Reset retry count on successful connection
        retryCountRef.current = 0
      })

      eventSource.onerror = err => {
        error("SSE connection error:", { error: err })
        // Fix #4: Use ref instead of direct call
        setIsLiveRef.current?.(false)

        // EventSource automatically reconnects, but we log the error
        if (eventSource.readyState === EventSource.CLOSED) {
          // Fix #6: Implement exponential backoff
          // Formula: min(2000 * 2^retryCount, 30000)
          // Results: 2s -> 4s -> 8s -> 16s -> 30s (capped)
          const delay = Math.min(2000 * 2 ** retryCountRef.current, 30000)
          retryCountRef.current++

          trace(`SSE connection closed, attempting reconnect #${retryCountRef.current} in ${delay}ms...`)

          // Fix #2: Clear before setting new timeout (already done above in connect(), but good practice)
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current)
          }

          // Attempt manual reconnect after exponential backoff delay
          reconnectTimeoutRef.current = window.setTimeout(() => {
            if (isSubscribed) {
              trace("Reconnecting SSE...")
              connect()
            }
          }, delay)
        }
      }
    }

    connect()

    // Cleanup on unmount
    return () => {
      isSubscribed = false
      // Fix #4: Use ref instead of direct call
      setIsLiveRef.current?.(false)
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }
    // Fix #4: Removed setIsLive from dependency array (now using ref)
  }, [apiUrl, queryClient])
}
