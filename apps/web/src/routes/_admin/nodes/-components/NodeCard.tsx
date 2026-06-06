import type { Node, NodeStatus } from "@kaja/schema"
import { getTimeAgo } from "@kaja/shared"
import { ChevronDown, ChevronUp, Server } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { CommandExecutor } from "./CommandExecutor"

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

export function NodeCard({ node }: Readonly<{ node: Node }>) {
  const statusConfig = STATUS_CONFIG[node.status]
  const lastSeenDate = new Date(node.lastSeen)

  // Local timer for smooth "last seen" updates without SSE traffic
  const [currentTime, setCurrentTime] = useState(() => new Date())

  // Track status changes for visual feedback
  const [isUpdating, setIsUpdating] = useState(false)
  const prevStatusRef = useRef(node.status)

  // Expandable command executor
  const [isExpanded, setIsExpanded] = useState(false)

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
      </div>

      <div className="space-y-3 pt-3 border-t border-border/20">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest text-muted">Location</span>
          <span className="font-mono text-xs text-muted">{node.geoLocation?.country?.name ?? "N/A"}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest text-muted">Last Seen</span>
          <span className="font-mono text-xs text-muted">{getTimeAgo(lastSeenDate, currentTime)}</span>
        </div>
      </div>

      {/* Expandable Command Executor */}
      <div className="pt-3 border-t border-border/20">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between px-2 py-1.5 rounded hover:bg-surface-2 transition-colors"
        >
          <span className="text-xs font-bold uppercase tracking-widest text-muted">Execute Command</span>
          {isExpanded ? (
            <ChevronUp size={16} className="text-muted" />
          ) : (
            <ChevronDown size={16} className="text-muted" />
          )}
        </button>

        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-border/10">
            <CommandExecutor node={node} />
          </div>
        )}
      </div>
    </div>
  )
}
