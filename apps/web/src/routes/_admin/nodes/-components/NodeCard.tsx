import type { Node, NodeStatus } from "@kaja/schema/api"
import { cn, getTimeAgo } from "@kaja/shared"
import { ChevronDown, ChevronUp, Server } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Section } from "../../../../components/ui/Section"
import { CommandExecutor } from "./CommandExecutor"

const STATUS_CONFIG: Record<NodeStatus, { label: string; color: string; dotColor: string }> = {
  idle: {
    label: "Idle",
    color: "text-neon",
    dotColor: "bg-neon"
  },
  busy: {
    label: "Busy",
    color: "text-ice",
    dotColor: "bg-ice"
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

  const [currentTime, setCurrentTime] = useState(() => new Date())
  const [isUpdating, setIsUpdating] = useState(false)
  const prevStatusRef = useRef(node.status)
  const [isExpanded, setIsExpanded] = useState(false)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (prevStatusRef.current !== node.status) {
      setIsUpdating(true)
      const timeout = setTimeout(() => setIsUpdating(false), 1000)
      prevStatusRef.current = node.status
      return () => clearTimeout(timeout)
    }
  }, [node.status])

  return (
    <Section className={cn("transition-all hover:border-neon/40", isUpdating && "ring-2 ring-neon/40")}>
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-md border border-neon/25 bg-neon/15">
            <Server size={16} className="text-neon" />
          </div>
          <div>
            <h3 className="m-0 mb-0.5 font-semibold text-fg text-[15px]">{node.name}</h3>
            <p className="m-0 max-w-[180px] truncate font-mono text-[#6e7681] text-[11px]">{node.id}</p>
          </div>
        </div>
      </div>

      <div className="space-y-3 border-border border-t pt-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[#6e7681] text-[11px] uppercase tracking-wider">Status</span>
          <div className="flex items-center gap-2">
            <div className={`h-1.5 w-1.5 rounded-full ${statusConfig.dotColor}`} />
            <span className={`text-sm font-medium ${statusConfig.color}`}>{statusConfig.label}</span>
          </div>
        </div>
      </div>

      <div className="space-y-3 border-border border-t pt-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[#6e7681] text-[11px] uppercase tracking-wider">Location</span>
          <span className="font-mono text-muted text-xs">{node.geoLocation?.country?.name ?? "N/A"}</span>
        </div>

        <div className="flex items-center justify-between">
          <span className="font-mono text-[#6e7681] text-[11px] uppercase tracking-wider">Last Seen</span>
          <span className="font-mono text-muted text-xs">{getTimeAgo(lastSeenDate, currentTime)}</span>
        </div>
      </div>

      <div className="border-border border-t pt-3">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex w-full items-center justify-between rounded-md px-2 py-1.5 transition-colors hover:bg-surface-2"
        >
          <span className="font-mono text-[#6e7681] text-[11px] uppercase tracking-wider">Execute Command</span>
          {isExpanded ? (
            <ChevronUp size={16} className="text-muted" />
          ) : (
            <ChevronDown size={16} className="text-muted" />
          )}
        </button>

        {isExpanded ? (
          <div className="mt-3 border-border border-t pt-3">
            <CommandExecutor node={node} />
          </div>
        ) : null}
      </div>
    </Section>
  )
}
