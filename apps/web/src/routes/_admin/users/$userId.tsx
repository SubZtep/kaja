import { getDateTime } from "@kaja/shared"
import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import type { UserWithRole } from "better-auth/plugins"
import { ArrowLeft, Calendar, CheckCircle2, Clock, Mail, Shield } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "react-toastify"
import { Loader } from "../../../components/ui/Loader"
import { UserSessions } from "../../../components/user/UserSessions"
import { useAuthClient } from "../../../hooks/auth-client"
import { userRequired } from "../../../lib/loaders"

export const Route = createFileRoute("/_admin/users/$userId")({
  component: UserPageComponent,
  loader: () => userRequired("admin")
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
  }, [])

  if (!user) return <Loader />

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link to="/users" className="rounded-lg p-2 text-muted transition-all hover:bg-surface-2">
          <ArrowLeft size={20} />
        </Link>
        <div className="space-y-1">
          <h2 className="my-0 text-3xl font-headline font-extrabold tracking-tight text-fg">{user.name}</h2>
          <p className="text-sm text-muted">User Details</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4 rounded-xl border border-border/40 bg-surface p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-2">
              {user.image ? (
                <img alt={user.name ?? ""} className="w-full h-full object-cover" src={user.image} />
              ) : (
                <span className="text-2xl font-bold text-neon">{user.name?.charAt(0)?.toUpperCase() ?? "?"}</span>
              )}
            </div>
            <div>
              <h3 className="text-lg font-headline font-bold text-fg">{user.name}</h3>
              <span className="text-sm text-muted">{user.email}</span>
            </div>
          </div>

          <div className="space-y-3 border-t border-border/40 pt-4">
            <DetailRow icon={Mail} label="Email" value={user.email} />
            <DetailRow
              icon={user.emailVerified ? CheckCircle2 : Clock}
              label="Verification"
              value={user.emailVerified ? "Verified" : "Pending"}
            />
            <DetailRow icon={Shield} label="Role" value={user.role ?? "user"} />
            <DetailRow icon={Calendar} label="Created" value={getDateTime(user.createdAt, "long")} />
          </div>
        </div>

        <div className="rounded-xl border border-border/40 bg-surface p-6">
          <UserSessions userId={userId} />
        </div>
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
      <span className="w-24 text-xs font-bold uppercase tracking-widest text-muted">{label}</span>
      <span className="text-sm text-fg">{value}</span>
    </div>
  )
}
