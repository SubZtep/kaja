import { getTimeAgo } from "@kaja/shared"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, useLoaderData } from "@tanstack/react-router"
import { Server } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "react-toastify"
import { Loader } from "#/components/ui/Loader"
import { userRequired } from "#/lib/loaders"

export const Route = createFileRoute("/_admin/nodes/")({
  component: NodesPage,
  loader: () => userRequired()
})

type NodeStatus = "idle" | "busy" | "inactive"

interface Node {
  id: string
  userId: string
  name: string
  lastSeen: string
  status: NodeStatus
}

const STATUS_CONFIG: Record<NodeStatus, { label: string; color: string; dotColor: string }> = {
  idle: {
    label: "Idle",
    color: "text-neon",
    dotColor: "bg-neon shadow-[0_0_8px_rgba(255,63,181,0.7)]"
  },
  busy: {
    label: "Busy",
    color: "text-ice",
    dotColor: "bg-ice shadow-[0_0_8px_rgba(139,233,253,0.7)]"
  },
  inactive: {
    label: "Inactive",
    color: "text-muted",
    dotColor: "bg-surface-2"
  }
}

/**
 * Hook to listen for real-time node updates via SSE
 */
function useNodeSSE(apiUrl: string, setIsLive?: (live: boolean) => void) {
  const queryClient = useQueryClient()
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    let isSubscribed = true

    function connect() {
      if (!isSubscribed) return

      // Create SSE connection
      const eventSource = new EventSource(`${apiUrl}/kaja/nodes/stream`, {
        withCredentials: true
      })
      eventSourceRef.current = eventSource

      eventSource.addEventListener("node-update", (event: MessageEvent) => {
        const data = JSON.parse(event.data)

        // Ignore ping and initial connection events (not node events)
        if (data.type === "ping") return
        if (data.type === "connected" && !data.node) return

        // Update the nodes query cache
        queryClient.setQueryData(["nodes"], (oldData: Node[] | undefined) => {
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
        setIsLive?.(true)
      })

      eventSource.onerror = error => {
        console.error("SSE connection error:", error)
        setIsLive?.(false)

        // EventSource automatically reconnects, but we log the error
        if (eventSource.readyState === EventSource.CLOSED) {
          console.log("SSE connection closed, attempting manual reconnect in 5s...")

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
      setIsLive?.(false)
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }
  }, [apiUrl, queryClient, setIsLive])
}

function NodesPage() {
  const { apiUrl } = useLoaderData({ from: "__root__" })
  const [isLive, setIsLive] = useState(false)

  const { data, error, isLoading } = useQuery({
    queryKey: ["nodes"],
    queryFn: async () => {
      const response = await fetch(`${apiUrl}/kaja/nodes`, {
        credentials: "include"
      })

      if (!response.ok) {
        throw new Error("Failed to fetch nodes")
      }

      const result = await response.json()
      return result.nodes as Node[]
    }
  })

  // Connect to SSE for real-time updates
  useNodeSSE(apiUrl, setIsLive)

  useEffect(() => {
    if (error) toast.error(error.message)
  }, [error])

  if (isLoading) return <Loader />

  const nodes = data || []
  const activeNodes = nodes.filter(n => n.status !== "inactive")
  const inactiveNodes = nodes.filter(n => n.status === "inactive")
  const activeCount = activeNodes.length
  const busyCount = nodes.filter(n => n.status === "busy").length

  return (
    <>
      <header className="mb-12 flex flex-col lg:flex-row justify-between lg:items-end gap-8">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="my-0 text-5xl font-headline font-bold tracking-tighter text-fg">My Nodes</h2>
            {isLive && (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-neon/10 border border-neon/30">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-neon" />
                </span>
                <span className="text-xs font-bold text-neon uppercase tracking-wider">Live</span>
              </span>
            )}
          </div>
          <p className="max-w-lg text-lg leading-relaxed text-muted">
            Connected CLI nodes sending heartbeats to the orchestration platform.
          </p>
        </div>
        <div className="flex gap-4">
          <div className="min-w-[160px] rounded-xl border-t-2 border-neon bg-surface p-6">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted">Active Nodes</p>
            <p className="text-3xl font-headline font-bold text-neon neon-glow">{activeCount}</p>
          </div>
          <div className="min-w-[160px] rounded-xl border-t-2 border-ice bg-surface p-6">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted">Busy</p>
            <p className="text-3xl font-headline font-bold text-ice neon-glow">{busyCount}</p>
          </div>
        </div>
      </header>

      {nodes.length === 0 ? (
        <section className="rounded-2xl bg-surface p-12 shadow-2xl text-center">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-surface-2 p-4">
              <Server size={32} className="text-muted" />
            </div>
          </div>
          <h3 className="mb-2 text-xl font-headline font-bold text-fg">No nodes connected</h3>
          <p className="max-w-md mx-auto leading-relaxed text-muted">
            Connect a CLI node to start seeing your orchestrated nodes here.
          </p>
        </section>
      ) : (
        <>
          {activeNodes.length > 0 && (
            <section className="mb-8">
              <h3 className="text-sm font-bold uppercase tracking-widest text-muted mb-4">Active Nodes</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeNodes.map(node => (
                  <NodeCard key={node.id} node={node} />
                ))}
              </div>
            </section>
          )}

          {inactiveNodes.length > 0 && (
            <section>
              <h3 className="text-sm font-bold uppercase tracking-widest text-muted mb-4">Inactive Nodes</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 opacity-60">
                {inactiveNodes.map(node => (
                  <NodeCard key={node.id} node={node} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  )
}

function NodeCard({ node }: Readonly<{ node: Node }>) {
  const statusConfig = STATUS_CONFIG[node.status]
  const lastSeenDate = new Date(node.lastSeen)

  // Local timer for smooth "last seen" updates without SSE traffic
  const [currentTime, setCurrentTime] = useState(() => new Date())

  // Track status changes for visual feedback
  const [isUpdating, setIsUpdating] = useState(false)
  const prevStatusRef = useRef(node.status)

  useEffect(() => {
    // Update current time every second for smooth "X seconds ago" display
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    // Trigger pulse animation when status changes
    if (prevStatusRef.current !== node.status) {
      setIsUpdating(true)
      const timeout = setTimeout(() => setIsUpdating(false), 1000)
      prevStatusRef.current = node.status
      return () => clearTimeout(timeout)
    }
  }, [node.status])

  return (
    <div
      className={`rounded-xl bg-surface p-6 shadow-2xl border border-border/20 hover:border-neon/30 transition-all ${
        isUpdating ? "ring-2 ring-neon/50 scale-[1.02]" : ""
      }`}
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-surface-2 p-2">
            <Server size={20} className="text-neon" />
          </div>
          <div>
            <h3 className="text-base font-headline font-bold text-fg mb-0.5">{node.name}</h3>
            <p className="text-[10px] font-mono text-muted truncate max-w-[180px]">{node.id}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3 pt-3 border-t border-border/20">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest text-muted">Status</span>
          <div className="flex items-center gap-2">
            <div className={`h-1.5 w-1.5 rounded-full ${statusConfig.dotColor}`} />
            <span className={`text-sm font-semibold ${statusConfig.color}`}>{statusConfig.label}</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest text-muted">Last Seen</span>
          <span className="font-mono text-xs text-muted">{getTimeAgo(lastSeenDate, currentTime)}</span>
        </div>
      </div>
    </div>
  )
}
