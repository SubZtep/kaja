import { createFileRoute } from "@tanstack/react-router"
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  ReactFlow,
  type ReactFlowProps
} from "@xyflow/react"
import { useCallback, useState } from "react"
import { userRequired } from "../../../lib/loaders"

export const Route = createFileRoute("/_admin/flow/")({
  component: FlowPage,
  loader: () => userRequired()
})

const initialNodes: ReactFlowProps["nodes"] = [
  { id: "n1", position: { x: 100, y: 0 }, data: { label: "Node 1" }, type: "input" },
  { id: "n2", position: { x: 0, y: 100 }, data: { label: "Node 2" }, type: "output" }
]
const initialEdges: ReactFlowProps["edges"] = [
  {
    id: "n1-n2",
    source: "n1",
    target: "n2",
    animated: true
    // type: "smoothstep"
  }
]

function FlowPage() {
  const [nodes, setNodes] = useState(initialNodes)
  const [edges, setEdges] = useState(initialEdges)

  const onNodesChange = useCallback(
    changes => setNodes(nodesSnapshot => nodesSnapshot && applyNodeChanges(changes, nodesSnapshot)),
    []
  )
  const onEdgesChange = useCallback(
    changes => setEdges(edgesSnapshot => edgesSnapshot && applyEdgeChanges(changes, edgesSnapshot)),
    []
  )
  const onConnect = useCallback(
    params => setEdges(edgesSnapshot => edgesSnapshot && addEdge(params, edgesSnapshot)),
    []
  )

  return (
    <div style={{ width: "100vw", height: "calc(100vh - var(--menu-height))" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodesConnectable={false}
        colorMode="dark"
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background bgColor="#200" size={2} color="#360000" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
