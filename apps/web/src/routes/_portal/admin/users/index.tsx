import { getTimeAgo } from "@kaja/shared/date"
import { capitalized, getDisplayName } from "@kaja/shared/text"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import type { CellContext } from "@tanstack/react-table"
import type { UserWithRole } from "better-auth/client/plugins"
import { Eye, Search, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "react-toastify"
import { Button } from "../../../../components/form/primitives/button"
import { Avatar } from "../../../../components/ui/avatar"
import { Badge } from "../../../../components/ui/badge"
import { IconButton } from "../../../../components/ui/icon-button"
import { Loader } from "../../../../components/ui/loader"
import { PageHeader } from "../../../../components/ui/page-header"
import { Section } from "../../../../components/ui/section"
import { Table } from "../../../../components/ui/table"
import { ValueBox } from "../../../../components/ui/value-box"
import { useAuthClient } from "../../../../hooks/auth-client"
import { seo } from "../../../../lib/seo"
import { tableColumnHelper, type tableFeaturesConfig } from "../../../../lib/table"
import { m } from "../../../../paraglide/messages.js"

export const Route = createFileRoute("/_portal/admin/users/")({
  component: UserList,
  head: () => ({ meta: seo({ title: m.nav_users() }) })
})

type UsersColumns = Pick<UserWithRole, "id" | "name" | "email" | "role" | "createdAt" | "image">
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
  const initials = getDisplayName(user)
    .split(" ")
    .map(n => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)
  return (
    <div className="flex items-center gap-4">
      <Avatar src={user.image} alt={user.name ?? ""} initials={initials} />
      <div>
        {user.name?.trim() && <div className="text-fg text-sm font-medium">{info.getValue()}</div>}
        <div className="text-muted text-xs">{user.email}</div>
      </div>
    </div>
  )
}

function AccessLevelCell(info: CellContext<typeof tableFeaturesConfig, UsersColumns, string | undefined>) {
  const role = info.getValue() ?? "user"
  return <Badge tone={ROLE_TONES[role] ?? ROLE_TONES.user}>{capitalized(role)}</Badge>
}

function LastSyncCell(info: CellContext<typeof tableFeaturesConfig, UsersColumns, Date>) {
  return <span className="text-muted font-mono text-xs">{getTimeAgo(info.getValue())}</span>
}

function ActionsCell(info: { readonly row: { readonly original: { readonly id: string } } }) {
  return (
    <div className="text-right">
      <IconButton
        variant="neutral"
        aria-label={m.users_view_details()}
        render={<Link to="/admin/users/$userId" params={{ userId: info.row.original.id }} />}
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
      const { data: listed, error: failure } = await admin.listUsers({ query: {} })
      if (failure) throw new Error(failure.message)
      return listed.users
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

  return (
    <>
      <PageHeader title={m.users_title()} description={m.users_description()}>
        <ValueBox label={m.users_total()} variant="neon">
          {userCount.toLocaleString()}
        </ValueBox>
      </PageHeader>

      <Section padded={false}>
        <div className="border-border flex flex-wrap items-center gap-4 border-b px-5.5 py-5 sm:px-6">
          <div className="relative min-w-70 flex-1">
            <Search size={16} className="text-muted absolute top-1/2 left-3.5 -translate-y-1/2" />
            <input
              type="text"
              placeholder={m.users_search_placeholder()}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="border-border bg-surface-2 text-fg placeholder:text-muted/70 focus:border-neon/50 w-full rounded-md border py-2.5 pr-3 pl-10 text-sm transition-colors outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted mr-1 font-mono text-[11px] tracking-wider uppercase">{m.users_filters()}</span>
            {roleFilter ? (
              <Button
                variant="chip"
                onClick={() => setRoleFilter("")}
                className="text-fg hover:border-neon/40 flex items-center gap-2"
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
                className="text-neon hover:text-neon-hi ml-1 font-mono text-[11px] tracking-wider uppercase"
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
