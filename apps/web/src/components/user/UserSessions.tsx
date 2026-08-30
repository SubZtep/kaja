import { getDateTime, getTimeAgo } from "@kaja/shared"
import { useMutation, useQuery } from "@tanstack/react-query"
import { flexRender, useTable } from "@tanstack/react-table"
import type { SessionWithImpersonatedBy } from "better-auth/plugins"
import { MonitorX } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "react-toastify"
import { UAParser } from "ua-parser-js"
import { useAuthClient } from "../../hooks/auth-client"
import { queryClient } from "../../lib/query"
import { tableColumnHelper, tableFeaturesConfig } from "../../lib/table"
import { Button } from "../form/primitives/Button"
import { ConfirmDialog } from "../ui/ConfirmDialog"

const columnHelper = tableColumnHelper<SessionWithImpersonatedBy>()

const columns = columnHelper.columns([
  columnHelper.accessor("ipAddress", {
    header: "IP",
    cell: info => info.getValue()
  }),
  columnHelper.accessor("userAgent", {
    header: "User Agent",
    cell: info => {
      const parsed = UAParser(info.getValue() || "{}")
      return (
        <span className="text-xs text-muted">
          {parsed.browser.name} / {parsed.os.name}
        </span>
      )
    }
  }),
  columnHelper.accessor("createdAt", {
    header: "Created",
    cell: info => getTimeAgo(info.getValue())
  }),
  columnHelper.accessor("expiresAt", {
    header: "Expires",
    cell: info => getDateTime(info.getValue(), "short")
  })
])

export function UserSessions({ userId, className }: Readonly<{ userId: string; className?: string }>) {
  const authClient = useAuthClient()
  const [sessions, setSessions] = useState<SessionWithImpersonatedBy[]>([])

  const { data, error, refetch } = useQuery({
    queryKey: ["userSessions", userId],
    queryFn: () => authClient.admin.listUserSessions({ userId })
  })

  const { mutate } = useMutation({
    mutationFn: () => authClient.admin.revokeUserSessions({ userId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["userSessions", userId] })
      await refetch()
    }
  })

  useEffect(() => {
    if (data?.data?.sessions && Array.isArray(data.data.sessions)) {
      setSessions(data.data.sessions)
    }
  }, [data])

  useEffect(() => {
    if (error) toast.error(error.message)
  }, [error])

  const table = useTable({
    features: tableFeaturesConfig,
    data: sessions,
    columns
  })

  return (
    <div className={className}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="m-0 font-semibold text-fg text-[15px]">Sessions</h2>
        <ConfirmDialog title="Are you sure?" onConfirm={() => mutate()}>
          <Button size="sm" variant="oval" disabled={sessions.length === 0}>
            <MonitorX size={14} className="mr-2" /> Revoke All
          </Button>
        </ConfirmDialog>
      </div>

      {sessions.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id} className="border-border border-b">
                  {headerGroup.headers.map(header => (
                    <th
                      key={header.id}
                      className="px-3 py-2 font-mono text-[#6e7681] text-[11px] uppercase tracking-wider"
                    >
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map(row => (
                <tr
                  key={row.id}
                  className="border-border border-b transition-colors last:border-0 hover:bg-surface-2/60"
                >
                  {row.getAllCells().map(cell => (
                    <td key={cell.id} className="px-3 py-2 text-muted">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="m-0 text-muted text-sm">No active sessions.</p>
      )}
    </div>
  )
}
