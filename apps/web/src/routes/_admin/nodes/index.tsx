import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Server } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { toast } from "react-toastify"
import { Loader } from "../../../components/ui/Loader"
import { ValueBox } from "../../../components/ui/ValueBox"
import { useApiSdk } from "../../../hooks/use-api-sdk"
import { userRequired } from "../../../lib/loaders"
import { NodeCard } from "./-components/NodeCard"
import { NodesHeader } from "./-components/NodesHeader"
import { useNodeSSE } from "./-components/use-node-sse"

export const Route = createFileRoute("/_admin/nodes/")({
  component: NodesPage,
  loader: () => userRequired()
})

function NodesPage() {
  const sdk = useApiSdk()
  const [isLive, setIsLive] = useState(false)

  // Wrap setIsLive in useCallback to prevent unnecessary SSE reconnections
  const handleSetIsLive = useCallback((live: boolean) => {
    setIsLive(live)
  }, [])

  const { data, error, isLoading } = useQuery({
    queryKey: ["nodes"],
    queryFn: () => sdk.nodes.list()
  })

  // Connect to SSE for real-time updates
  useNodeSSE(sdk.baseUrl, handleSetIsLive)

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
      <NodesHeader isLive={isLive}>
        <ValueBox label="Active Nodes" variant="neon">
          {activeCount}
        </ValueBox>
        <ValueBox label="Busy">{busyCount}</ValueBox>
      </NodesHeader>

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
