import { getDateTime } from "@kaja/shared/date"
import { getDisplayName } from "@kaja/shared/text"
import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import type { UserWithRole } from "better-auth/plugins"
import { ArrowLeft, Calendar, Mail, Shield } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "react-toastify"
import { Avatar } from "../../../../components/ui/Avatar"
import { Loader } from "../../../../components/ui/Loader"
import { PageHeader } from "../../../../components/ui/PageHeader"
import { Section } from "../../../../components/ui/Section"
import { UserSessions } from "../../../../components/user/UserSessions"
import { useAuthClient } from "../../../../hooks/auth-client"
import { seo } from "../../../../lib/seo"
import { m } from "../../../../paraglide/messages.js"

export const Route = createFileRoute("/_admin/admin/users/$userId")({
  component: UserPageComponent,
  head: () => ({ meta: seo({ title: m.seo_user_title() }) })
})

function UserPageComponent() {
  const { userId } = useParams({ from: "/_admin/admin/users/$userId" })
  const authClient = useAuthClient()
  const [user, setUser] = useState<UserWithRole>()

  useEffect(() => {
    void (async () => {
      const { data, error } = await authClient.admin.getUser({ query: { id: userId } })
      if (error) toast.error(error.message)
      if (data) setUser(data)
    })()
  }, [authClient, userId])

  if (!user) return <Loader />

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-3">
            <Link
              to="/admin/users"
              aria-label={m.users_back_to_list()}
              className="border-border bg-surface text-muted hover:border-neon/40 hover:text-fg inline-flex rounded-md border p-1.5 transition-colors"
            >
              <ArrowLeft size={18} />
            </Link>
            {getDisplayName(user)}
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
              initials={getDisplayName(user).charAt(0).toUpperCase()}
            />
            <div>
              <h2 className="text-fg m-0 text-[15px] font-semibold">{getDisplayName(user)}</h2>
              <span className="text-muted text-sm">{user.email}</span>
            </div>
          </div>

          <div className="border-border space-y-3 border-t pt-4">
            <DetailRow icon={Mail} label={m.user_detail_field_email()} value={user.email} />
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
      <Icon size={16} className="text-muted shrink-0" />
      <span className="text-muted w-24 font-mono text-[11px] tracking-wider uppercase">{label}</span>
      <span className="text-fg text-sm">{value}</span>
    </div>
  )
}
