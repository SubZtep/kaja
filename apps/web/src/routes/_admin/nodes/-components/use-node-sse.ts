import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef } from "react"
import { z } from "zod"
import type { Node } from ".."

// Zod schemas for SSE event validation
const NodeDataSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  lastSeen: z.string(),
  status: z.enum(["idle", "busy", "inactive"])
})

const PingEventSchema = z.object({
  type: z.literal("ping")
})

const ConnectedEventSchema = z.object({
  type: z.literal("connected"),
  node: NodeDataSchema.optional()
})

const NodeUpdateEventSchema = z.object({
  type: z.enum(["connected", "heartbeat", "disconnect", "status-change"]),
  node: NodeDataSchema
})

const SSEEventSchema = z.union([PingEventSchema, ConnectedEventSchema, NodeUpdateEventSchema])

/**
 * Hook to listen for real-time node updates via SSE
 */
export function useNodeSSE(apiUrl: string, setIsLive?: (live: boolean) => void) {
  const queryClient = useQueryClient()
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
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
        } catch (error) {
          console.error("Failed to parse SSE event data:", error)
          return
        }

        // Fix #7: Validate data with Zod schema
        const parseResult = SSEEventSchema.safeParse(rawData)
        if (!parseResult.success) {
          console.error("Invalid SSE event data:", parseResult.error.issues)
          return
        }

        const data = parseResult.data

        // Ignore ping and initial connection events (not node events)
        if (data.type === "ping") return
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
      })

      eventSource.onerror = error => {
        console.error("SSE connection error:", error)
        // Fix #4: Use ref instead of direct call
        setIsLiveRef.current?.(false)

        // EventSource automatically reconnects, but we log the error
        if (eventSource.readyState === EventSource.CLOSED) {
          console.log("SSE connection closed, attempting manual reconnect in 5s...")

          // Fix #2: Clear before setting new timeout (already done above in connect(), but good practice)
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current)
          }

          // Attempt manual reconnect after a delay
          reconnectTimeoutRef.current = window.setTimeout(() => {
            if (isSubscribed) {
              console.log("Reconnecting SSE...")
              connect()
            }
          }, 5000)
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
