import { capitalized, getTimeAgo } from "@kaja/shared"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import type { CellContext } from "@tanstack/react-table"
import type { UserWithRole } from "better-auth/client/plugins"
import { Eye, Search, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "react-toastify"
import { Loader } from "../../../components/ui/Loader"
import { PageHeader } from "../../../components/ui/PageHeader"
import { Section } from "../../../components/ui/Section"
import { Table } from "../../../components/ui/Table"
import { ValueBox } from "../../../components/ui/ValueBox"
import { useAuthClient } from "../../../hooks/auth-client"
import { userRequired } from "../../../lib/loaders"
import { tableColumnHelper, type tableFeaturesConfig } from "../../../lib/table"
import { getPageTitle } from "../../../lib/vars"

export const Route = createFileRoute("/_admin/users/")({
  component: UserList,
  loader: () => userRequired("admin"),
  head: () => ({ meta: [{ title: getPageTitle("Users") }] })
})

type UsersColumns = Pick<UserWithRole, "id" | "name" | "email" | "emailVerified" | "role" | "createdAt" | "image">
const columnHelper = tableColumnHelper<UsersColumns>()

const ROLE_STYLES: Record<string, string> = {
  admin: "bg-ice/10 text-ice",
  superuser: "bg-ice/10 text-ice",
  user: "bg-surface/60 text-muted",
  editor: "bg-surface/60 text-muted",
  viewer: "bg-surface/60 text-muted"
}

function IdentityCell(info: CellContext<typeof tableFeaturesConfig, UsersColumns, string>) {
  const user = info.row.original
  const initials = (user.name ?? "?")
    .split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
  return (
    <div className="flex items-center gap-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-2">
        {user.image ? (
          <img alt={user.name ?? ""} className="h-full w-full object-cover" src={user.image} />
        ) : (
          <span className="font-mono text-neon text-xs font-semibold">{initials}</span>
        )}
      </div>
      <div>
        <div className="font-medium text-fg text-sm">{info.getValue()}</div>
        <div className="text-muted text-xs">{user.email}</div>
      </div>
    </div>
  )
}

function AccessLevelCell(info: CellContext<typeof tableFeaturesConfig, UsersColumns, string | undefined>) {
  const role = info.getValue() ?? "user"
  const style = ROLE_STYLES[role] ?? ROLE_STYLES.user
  return <span className={`rounded-md px-2.5 py-1 font-mono text-xs ${style}`}>{capitalized(role)}</span>
}

function StatusCell(info: CellContext<typeof tableFeaturesConfig, UsersColumns, boolean>) {
  const verified = info.getValue()
  if (verified) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-1.5 rounded-full bg-neon" />
        <span className="text-muted text-xs">Authenticated</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-1.5 rounded-full bg-surface-2" />
      <span className="text-xs text-muted">Pending</span>
    </div>
  )
}

function LastSyncCell(info: CellContext<typeof tableFeaturesConfig, UsersColumns, Date>) {
  return <span className="font-mono text-xs text-muted">{getTimeAgo(info.getValue())}</span>
}

function ActionsCell(info: { readonly row: { readonly original: { readonly id: string } } }) {
  return (
    <div className="text-right">
      <Link
        to="/users/$userId"
        params={{ userId: info.row.original.id }}
        className="inline-flex rounded-md p-2 text-neon transition-colors hover:bg-neon/10"
      >
        <Eye size={18} />
      </Link>
    </div>
  )
}

function UserList() {
  const [users, setUsers] = useState<UserWithRole[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [roleFilter, setRoleFilter] = useState("")
  const { admin } = useAuthClient()

  const { data, error, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const { data, error } = await admin.listUsers({ query: {} })
      if (error) throw new Error(error.message)
      return data.users
    }
  })

  useEffect(() => {
    if (error) toast.error(error.message)
  }, [error])

  useEffect(() => {
    if (data && Array.isArray(data)) setUsers(data)
  }, [data])

  // Filter users based on search and role filter
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const matchesSearch =
        !searchQuery ||
        (user.name ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (user.email ?? "").toLowerCase().includes(searchQuery.toLowerCase())

      const matchesRole = !roleFilter || (user.role ?? "user") === roleFilter

      return matchesSearch && matchesRole
    })
  }, [users, searchQuery, roleFilter])

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("name", {
          header: "User Identity",
          cell: IdentityCell
        }),
        columnHelper.accessor("role", {
          header: "Access Level",
          cell: AccessLevelCell
        }),
        columnHelper.accessor("emailVerified", {
          header: "Status",
          cell: StatusCell,
          enableColumnFilter: false
        }),
        columnHelper.accessor("createdAt", {
          header: "Last Sync",
          cell: LastSyncCell,
          enableColumnFilter: false
        }),
        columnHelper.display({
          id: "actions",
          header: "",
          cell: ActionsCell
        })
      ]),
    []
  )

  if (isLoading) return <Loader />
  if (!users || users.length === 0) return null

  const userCount = users.length
  const activeCount = users.filter(u => u.emailVerified).length

  return (
    <>
      <PageHeader
        title="Users"
        description="Manage your organization's identity hierarchy and access controls."
        meta="directory"
      >
        <ValueBox label="Total Users" variant="neon">
          {userCount.toLocaleString()}
        </ValueBox>
        <ValueBox label="Verified">{activeCount}</ValueBox>
      </PageHeader>

      <Section padded={false}>
        <div className="flex flex-wrap items-center gap-4 border-border border-b px-5.5 py-5 sm:px-6">
          <div className="relative min-w-70 flex-1">
            <Search size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search by name, email, or role..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-border bg-surface-2 py-2.5 pr-3 pl-10 text-fg text-sm outline-none transition-colors placeholder:text-muted/70 focus:border-neon/50"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="mr-1 font-mono text-[#6e7681] text-[11px] uppercase tracking-wider">Filters</span>
            {roleFilter ? (
              <button
                type="button"
                onClick={() => setRoleFilter("")}
                className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-1.5 font-medium text-fg text-xs transition-colors hover:border-neon/40"
              >
                Role: {capitalized(roleFilter)} <X size={12} />
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setRoleFilter("admin")}
                  className="rounded-md border border-border bg-surface-2 px-3 py-1.5 font-medium text-muted text-xs transition-colors hover:text-fg"
                >
                  Admin
                </button>
                <button
                  type="button"
                  onClick={() => setRoleFilter("user")}
                  className="rounded-md border border-border bg-surface-2 px-3 py-1.5 font-medium text-muted text-xs transition-colors hover:text-fg"
                >
                  User
                </button>
              </>
            )}
            {(searchQuery || roleFilter) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("")
                  setRoleFilter("")
                }}
                className="ml-1 font-mono text-neon text-[11px] uppercase tracking-wider hover:text-neon-hi"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="px-5.5 py-5 sm:px-6">
          <Table columns={columns} data={filteredUsers} showFilters={false} />
        </div>
      </Section>
    </>
  )
}
