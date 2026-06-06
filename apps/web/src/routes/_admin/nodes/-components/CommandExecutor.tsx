import type { Node } from "@kaja/schema"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Terminal, X } from "lucide-react"
import { useState } from "react"
import { toast } from "react-toastify"
import { Button } from "../../../../components/form/primitives/Button"
import { Text } from "../../../../components/form/primitives/Text"
import { useApiSdk } from "../../../../hooks/use-api-sdk"

interface CommandExecutorProps {
  node: Node
}

export function CommandExecutor({ node }: CommandExecutorProps) {
  const sdk = useApiSdk()
  const queryClient = useQueryClient()
  const [command, setCommand] = useState("")

  // Fetch command history for this node
  const { data: commands = [] } = useQuery({
    queryKey: ["commands", node.id],
    queryFn: () => sdk.commands.list(node.id),
    refetchInterval: 2000 // Poll every 2 seconds for updates
  })

  // Create command mutation
  const createCommand = useMutation({
    mutationFn: async (cmd: string) => {
      return sdk.commands.create(node.id, {
        command: cmd,
        timeoutSeconds: 300
      })
    },
    onSuccess: () => {
      setCommand("")
      queryClient.invalidateQueries({ queryKey: ["commands", node.id] })
      toast.success("Command sent!")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to send command")
    }
  })

  // Cancel command mutation
  const cancelCommand = useMutation({
    mutationFn: async (commandId: string) => {
      return sdk.commands.cancel(commandId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commands", node.id] })
      toast.success("Command cancelled")
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to cancel command")
    }
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!command.trim()) return
    createCommand.mutate(command.trim())
  }

  const handleCancel = () => {
    if (latestCommand) {
      cancelCommand.mutate(latestCommand.id)
    }
  }

  const latestCommand = commands[0]
  const isExecuting = latestCommand?.status === "executing" || latestCommand?.status === "pending"

  return (
    <div className="space-y-4">
      {/* Command Input Form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="flex-1">
          <Text
            type="text"
            value={command}
            onChange={e => setCommand(e.target.value)}
            placeholder="Enter command (e.g., echo 'Hello from web!')"
            disabled={node.status === "inactive" || createCommand.isPending || isExecuting}
            className="font-mono text-sm"
            variant="3d"
          />
        </div>
        <Button
          type="submit"
          disabled={!command.trim() || node.status === "inactive" || createCommand.isPending || isExecuting}
          className="gap-2"
        >
          <Terminal size={16} />
          {isExecuting ? "Executing..." : "Run"}
        </Button>
      </form>

      {/* Command Output */}
      {latestCommand && (
        <div className="rounded-lg bg-surface-2 border border-border/20 overflow-hidden">
          <div className="px-4 py-2 border-b border-border/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal size={14} className="text-muted" />
              <span className="font-mono text-xs text-muted">{latestCommand.command}</span>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={latestCommand.status} />
              {latestCommand.exitCode !== undefined && latestCommand.exitCode !== null && (
                <span className="text-xs text-muted font-mono">exit: {latestCommand.exitCode}</span>
              )}
              {isExecuting && (
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={cancelCommand.isPending}
                  className="p-1 hover:bg-surface-3 rounded text-muted hover:text-fg transition-colors disabled:opacity-50"
                  title="Cancel command"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Command Result */}
          <div className="p-4 font-mono text-sm max-h-96 overflow-auto">
            {latestCommand.status === "pending" && <div className="text-muted italic">Waiting for node...</div>}

            {latestCommand.status === "executing" && <div className="text-ice animate-pulse">Executing command...</div>}

            {latestCommand.status === "completed" && latestCommand.result !== undefined && (
              <pre className="text-fg whitespace-pre-wrap">
                {typeof latestCommand.result === "string"
                  ? latestCommand.result
                  : JSON.stringify(latestCommand.result, null, 2)}
              </pre>
            )}

            {latestCommand.status === "failed" && (
              <div className="space-y-2">
                {latestCommand.error && <pre className="text-red-400 whitespace-pre-wrap">{latestCommand.error}</pre>}
                {latestCommand.result !== undefined && (
                  <pre className="text-muted whitespace-pre-wrap">
                    {typeof latestCommand.result === "string"
                      ? latestCommand.result
                      : JSON.stringify(latestCommand.result, null, 2)}
                  </pre>
                )}
              </div>
            )}

            {latestCommand.status === "timeout" && (
              <div className="text-yellow-400">
                Command timed out after {latestCommand.timeoutSeconds} seconds
                {latestCommand.error && <div className="text-muted mt-2">{latestCommand.error}</div>}
              </div>
            )}
          </div>

          {/* Timestamp Info */}
          <div className="px-4 py-2 border-t border-border/20 flex gap-4 text-xs text-muted">
            <span>Created: {new Date(latestCommand.createdAt).toLocaleTimeString()}</span>
            {latestCommand.completedAt && (
              <span>
                Completed: {new Date(latestCommand.completedAt).toLocaleTimeString()} (
                {Math.round(
                  (new Date(latestCommand.completedAt).getTime() - new Date(latestCommand.createdAt).getTime()) / 1000
                )}
                s)
              </span>
            )}
          </div>
        </div>
      )}

      {/* Inactive Node Warning */}
      {node.status === "inactive" && (
        <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-sm text-yellow-400">
          This node is inactive. Commands cannot be sent until it reconnects.
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    pending: { label: "Pending", color: "bg-yellow-500/20 text-yellow-400" },
    executing: { label: "Executing", color: "bg-ice/20 text-ice" },
    completed: { label: "Completed", color: "bg-green-500/20 text-green-400" },
    failed: { label: "Failed", color: "bg-red-500/20 text-red-400" },
    timeout: { label: "Timeout", color: "bg-orange-500/20 text-orange-400" }
  }

  const { label, color } = config[status as keyof typeof config] || config.pending

  return <span className={`px-2 py-0.5 rounded text-xs font-semibold ${color}`}>{label}</span>
}
