import { type ImageStats, imageStatsSchema } from "@kaja/schema/api"
import { getDateTime } from "@kaja/shared/date"
import { getDisplayName } from "@kaja/shared/text"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useParams } from "@tanstack/react-router"
import type { UserWithRole } from "better-auth/plugins"
import { ArrowLeft, Calendar, Mail, Shield } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "react-toastify"
import { ImagesCard } from "../../../../components/stats/images-card"
import { Avatar } from "../../../../components/ui/avatar"
import { Loader } from "../../../../components/ui/loader"
import { PageHeader } from "../../../../components/ui/page-header"
import { Section } from "../../../../components/ui/section"
import { UserSessions } from "../../../../components/user/user-sessions"
import { useAuthClient } from "../../../../hooks/auth-client"
import { useApiFetch } from "../../../../lib/api-fetch"
import { seo } from "../../../../lib/seo"
import { m } from "../../../../paraglide/messages.js"

export const Route = createFileRoute("/_portal/admin/users/$userId")({
  component: UserPageComponent,
  head: () => ({ meta: seo({ title: m.seo_user_title() }) })
})

function UserPageComponent() {
  const { userId } = useParams({ from: "/_portal/admin/users/$userId" })
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

      <UserImages userId={userId} />
    </div>
  )
}

const IMAGE_DAYS = 30

/** The user's stored images, as their own stats page shows them, with the last 30 days' additions. */
function UserImages({ userId }: Readonly<{ userId: string }>) {
  const apiFetch = useApiFetch()
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const images = useQuery({
    queryKey: ["admin-user-images", userId, tz],
    queryFn: () =>
      apiFetch<ImageStats>(`/admin/users/${userId}/images?days=${IMAGE_DAYS}&tz=${encodeURIComponent(tz)}`).then(r =>
        imageStatsSchema.parse(r)
      )
  })
  if (images.isError) return <p className="m-0 text-sm text-red-400">{m.user_detail_images_error()}</p>
  if (!images.data) return <Loader slim />
  return (
    <div className="flex flex-col gap-2">
      <ImagesCard images={images.data} days={IMAGE_DAYS} adminUserId={userId} />
      {images.data.count > 0 && (
        <Link to="/admin/images" search={{ user: userId }} className="text-neon self-end text-sm underline">
          {m.user_detail_images_see_all()}
        </Link>
      )}
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
