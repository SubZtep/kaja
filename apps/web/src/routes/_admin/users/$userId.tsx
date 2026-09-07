import { getDateTime } from "@kaja/shared"
import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import type { UserWithRole } from "better-auth/plugins"
import { ArrowLeft, Calendar, CheckCircle2, Clock, Mail, Shield } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "react-toastify"
import { Avatar } from "../../../components/ui/Avatar"
import { Loader } from "../../../components/ui/Loader"
import { PageHeader } from "../../../components/ui/PageHeader"
import { Section } from "../../../components/ui/Section"
import { UserSessions } from "../../../components/user/UserSessions"
import { useAuthClient } from "../../../hooks/auth-client"
import { userRequired } from "../../../lib/loaders"
import { seo } from "../../../lib/seo"
import { m } from "../../../paraglide/messages.js"

export const Route = createFileRoute("/_admin/users/$userId")({
  component: UserPageComponent,
  loader: () => userRequired("admin"),
  head: () => ({ meta: seo({ title: m.seo_user_title() }) })
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
              aria-label={m.users_back_to_list()}
              className="inline-flex rounded-md border border-border bg-surface p-1.5 text-muted transition-colors hover:border-neon/40 hover:text-fg"
            >
              <ArrowLeft size={18} />
            </Link>
            {user.name}
          </span>
        }
        description={m.user_detail_description()}
        meta={user.role ?? "user"}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section>
          <div className="mb-5 flex items-center gap-4">
            <Avatar
              size="lg"
              src={user.image}
              alt={user.name ?? ""}
              initials={user.name?.charAt(0)?.toUpperCase() ?? "?"}
            />
            <div>
              <h2 className="m-0 font-semibold text-fg text-[15px]">{user.name}</h2>
              <span className="text-muted text-sm">{user.email}</span>
            </div>
          </div>

          <div className="space-y-3 border-border border-t pt-4">
            <DetailRow icon={Mail} label={m.user_detail_field_email()} value={user.email} />
            <DetailRow
              icon={user.emailVerified ? CheckCircle2 : Clock}
              label={m.user_detail_field_verification()}
              value={
                user.emailVerified
                  ? m.user_detail_field_verification_verified()
                  : m.user_detail_field_verification_pending()
              }
            />
            <DetailRow icon={Shield} label={m.user_detail_field_role()} value={user.role ?? "user"} />
            <DetailRow
              icon={Calendar}
              label={m.user_detail_field_created()}
              value={getDateTime(user.createdAt, "long")}
            />
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
      <span className="w-24 font-mono text-[11px] text-muted uppercase tracking-wider">{label}</span>
      <span className="text-fg text-sm">{value}</span>
    </div>
  )
}
