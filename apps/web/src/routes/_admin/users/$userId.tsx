import { getDateTime } from "@kaja/shared"
import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import type { UserWithRole } from "better-auth/plugins"
import { ArrowLeft, Calendar, CheckCircle2, Clock, Mail, Shield } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "react-toastify"
import { Loader } from "../../../components/ui/Loader"
import { PageHeader } from "../../../components/ui/PageHeader"
import { Section } from "../../../components/ui/Section"
import { UserSessions } from "../../../components/user/UserSessions"
import { useAuthClient } from "../../../hooks/auth-client"
import { userRequired } from "../../../lib/loaders"
import { getPageTitle } from "../../../lib/vars"

export const Route = createFileRoute("/_admin/users/$userId")({
  component: UserPageComponent,
  loader: () => userRequired("admin"),
  head: () => ({ meta: [{ title: getPageTitle("User") }] })
})

function UserPageComponent() {
  const { userId } = useParams({ from: "/_admin/users/$userId" })
  const authClient = useAuthClient()
  const [user, setUser] = useState<UserWithRole>()

  useEffect(() => {
    void (async () => {
      const { data, error } = await authClient.admin.getUser({ query: { id: userId } })
      if (error) toast.error(error.message)
      if (data) setUser(data)
    })()
  }, [userId])

  if (!user) return <Loader />

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            <Link
              to="/users"
              className="inline-flex rounded-md border border-border bg-surface p-1.5 text-muted transition-colors hover:border-neon/40 hover:text-fg"
            >
              <ArrowLeft size={18} />
            </Link>
            {user.name}
          </span>
        }
        description="User details and active sessions"
        meta={user.role ?? "user"}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section>
          <div className="mb-5 flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-2">
              {user.image ? (
                <img alt={user.name ?? ""} className="h-full w-full object-cover" src={user.image} />
              ) : (
                <span className="font-mono font-semibold text-neon text-xl">
                  {user.name?.charAt(0)?.toUpperCase() ?? "?"}
                </span>
              )}
            </div>
            <div>
              <h2 className="m-0 font-semibold text-fg text-[15px]">{user.name}</h2>
              <span className="text-muted text-sm">{user.email}</span>
            </div>
          </div>

          <div className="space-y-3 border-border border-t pt-4">
            <DetailRow icon={Mail} label="Email" value={user.email} />
            <DetailRow
              icon={user.emailVerified ? CheckCircle2 : Clock}
              label="Verification"
              value={user.emailVerified ? "Verified" : "Pending"}
            />
            <DetailRow icon={Shield} label="Role" value={user.role ?? "user"} />
            <DetailRow icon={Calendar} label="Created" value={getDateTime(user.createdAt, "long")} />
          </div>
        </Section>

        <Section>
          <UserSessions userId={userId} />
        </Section>
      </div>
    </div>
  )
}

function DetailRow({
  icon: Icon,
  label,
  value
}: Readonly<{
  icon: React.ComponentType<{ size?: number; className?: string }>
  label: string
  value: string
}>) {
  return (
    <div className="flex items-center gap-3">
      <Icon size={16} className="shrink-0 text-muted" />
      <span className="w-24 font-mono text-[#6e7681] text-[11px] uppercase tracking-wider">{label}</span>
      <span className="text-fg text-sm">{value}</span>
    </div>
  )
}
