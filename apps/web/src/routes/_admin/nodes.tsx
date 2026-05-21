import { getTimeAgo } from "@kaja/shared"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useLoaderData } from "@tanstack/react-router"
import { Server } from "lucide-react"
import { useEffect } from "react"
import { toast } from "react-toastify"
import { Loader } from "#/components/ui/Loader"
import { userRequired } from "#/lib/loaders"

export const Route = createFileRoute("/_admin/nodes")({
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

function NodesPage() {
  const { apiUrl } = useLoaderData({ from: "__root__" })

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

  useEffect(() => {
    if (error) toast.error(error.message)
  }, [error])

  if (isLoading) return <Loader />

  const nodes = data || []
  const activeCount = nodes.filter(n => n.status !== "inactive").length
  const busyCount = nodes.filter(n => n.status === "busy").length

  return (
    <>
      <header className="mb-12 flex flex-col lg:flex-row justify-between lg:items-end gap-8">
        <div className="max-w-2xl">
          <h2 className="my-0 mb-4 text-5xl font-headline font-bold tracking-tighter text-fg">My Nodes</h2>
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
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {nodes.map(node => (
            <NodeCard key={node.id} node={node} />
          ))}
        </section>
      )}
    </>
  )
}

function NodeCard({ node }: Readonly<{ node: Node }>) {
  const statusConfig = STATUS_CONFIG[node.status]
  const lastSeenDate = new Date(node.lastSeen)

  return (
    <div className="rounded-xl bg-surface p-6 shadow-2xl border border-border/20 hover:border-neon/30 transition-colors">
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
          <span className="font-mono text-xs text-muted">{getTimeAgo(lastSeenDate)}</span>
        </div>
      </div>
    </div>
  )
}
