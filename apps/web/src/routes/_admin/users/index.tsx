import { capitalized, getTimeAgo } from "@kaja/shared"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import type { CellContext } from "@tanstack/react-table"
import type { UserWithRole } from "better-auth/client/plugins"
import { Eye, Search, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "react-toastify"
import { Button } from "../../../components/form/primitives/Button"
import { Avatar } from "../../../components/ui/Avatar"
import { Badge } from "../../../components/ui/Badge"
import { IconButton } from "../../../components/ui/IconButton"
import { Loader } from "../../../components/ui/Loader"
import { PageHeader } from "../../../components/ui/PageHeader"
import { Section } from "../../../components/ui/Section"
import { StatusDot } from "../../../components/ui/StatusDot"
import { Table } from "../../../components/ui/Table"
import { ValueBox } from "../../../components/ui/ValueBox"
import { useAuthClient } from "../../../hooks/auth-client"
import { userRequired } from "../../../lib/loaders"
import { seo } from "../../../lib/seo"
import { tableColumnHelper, type tableFeaturesConfig } from "../../../lib/table"
import { m } from "../../../paraglide/messages.js"

export const Route = createFileRoute("/_admin/users/")({
  component: UserList,
  loader: () => userRequired("admin"),
  head: () => ({ meta: seo({ title: m.nav_users() }) })
})

type UsersColumns = Pick<UserWithRole, "id" | "name" | "email" | "emailVerified" | "role" | "createdAt" | "image">
const columnHelper = tableColumnHelper<UsersColumns>()

const ROLE_TONES: Record<string, "ice" | "muted"> = {
  admin: "ice",
  superuser: "ice",
  user: "muted",
  editor: "muted",
  viewer: "muted"
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
      <Avatar src={user.image} alt={user.name ?? ""} initials={initials} />
      <div>
        <div className="font-medium text-fg text-sm">{info.getValue()}</div>
        <div className="text-muted text-xs">{user.email}</div>
      </div>
    </div>
  )
}

function AccessLevelCell(info: CellContext<typeof tableFeaturesConfig, UsersColumns, string | undefined>) {
  const role = info.getValue() ?? "user"
  return <Badge tone={ROLE_TONES[role] ?? ROLE_TONES.user}>{capitalized(role)}</Badge>
}

function StatusCell(info: CellContext<typeof tableFeaturesConfig, UsersColumns, boolean>) {
  const verified = info.getValue()
  return <StatusDot active={verified} label={verified ? m.users_status_authenticated() : m.users_status_pending()} />
}

function LastSyncCell(info: CellContext<typeof tableFeaturesConfig, UsersColumns, Date>) {
  return <span className="font-mono text-xs text-muted">{getTimeAgo(info.getValue())}</span>
}

function ActionsCell(info: { readonly row: { readonly original: { readonly id: string } } }) {
  return (
    <div className="text-right">
      <IconButton
        variant="neutral"
        aria-label={m.users_view_details()}
        render={<Link to="/users/$userId" params={{ userId: info.row.original.id }} />}
      >
        <Eye size={18} />
      </IconButton>
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
          header: m.users_column_identity(),
          cell: IdentityCell
        }),
        columnHelper.accessor("role", {
          header: m.users_column_access_level(),
          cell: AccessLevelCell
        }),
        columnHelper.accessor("emailVerified", {
          header: m.users_column_status(),
          cell: StatusCell,
          enableColumnFilter: false
        }),
        columnHelper.accessor("createdAt", {
          header: m.users_column_last_sync(),
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
      <PageHeader title={m.users_title()} description={m.users_description()} meta={m.users_meta()}>
        <ValueBox label={m.users_total()} variant="neon">
          {userCount.toLocaleString()}
        </ValueBox>
        <ValueBox label={m.users_verified()}>{activeCount}</ValueBox>
      </PageHeader>

      <Section padded={false}>
        <div className="flex flex-wrap items-center gap-4 border-border border-b px-5.5 py-5 sm:px-6">
          <div className="relative min-w-70 flex-1">
            <Search size={16} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder={m.users_search_placeholder()}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-border bg-surface-2 py-2.5 pr-3 pl-10 text-fg text-sm outline-none transition-colors placeholder:text-muted/70 focus:border-neon/50"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="mr-1 font-mono text-[11px] text-muted uppercase tracking-wider">{m.users_filters()}</span>
            {roleFilter ? (
              <Button
                variant="chip"
                onClick={() => setRoleFilter("")}
                className="flex items-center gap-2 text-fg hover:border-neon/40"
              >
                {m.users_filter_role({ role: capitalized(roleFilter) })} <X size={12} />
              </Button>
            ) : (
              <>
                <Button variant="chip" onClick={() => setRoleFilter("admin")} className="text-muted hover:text-fg">
                  {m.role_admin()}
                </Button>
                <Button variant="chip" onClick={() => setRoleFilter("user")} className="text-muted hover:text-fg">
                  {m.role_user()}
                </Button>
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
                {m.users_clear()}
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
