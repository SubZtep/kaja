import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useEffect, useState } from "react"
import { toast } from "react-toastify"
import { Loader } from "../../../components/ui/Loader"
import { ValueBox } from "../../../components/ui/ValueBox"
import { useApiSdk } from "../../../hooks/use-api-sdk"
import { userRequired } from "../../../lib/loaders"
import { NodeCard } from "./-components/NodeCard"
import { NodeGroup } from "./-components/NodeGroup"
import { NodesHeader } from "./-components/NodesHeader"
import { NoNodesBanner } from "./-components/NoNodesBanner"
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
        <NoNodesBanner />
      ) : (
        <>
          {activeNodes.length > 0 && (
            <NodeGroup title="Active Nodes">
              {activeNodes.map(node => (
                <NodeCard key={node.id} node={node} />
              ))}
            </NodeGroup>
          )}

          {inactiveNodes.length > 0 && (
            <NodeGroup title="Inactive Nodes" className="opacity-60">
              {inactiveNodes.map(node => (
                <NodeCard key={node.id} node={node} />
              ))}
            </NodeGroup>
          )}
        </>
      )}
    </>
  )
}
