import { getFirstName } from "@kaja/shared"
import { createFileRoute } from "@tanstack/react-router"
import { UsageStats } from "../../components/stats/UsageStats"
import { PageHeader } from "../../components/ui/PageHeader"
import { Section } from "../../components/ui/Section"
import { ConnectTelegram } from "../../components/user/ConnectTelegram"
import { useUser } from "../../hooks/user"
import { seo } from "../../lib/seo"
import { m } from "../../paraglide/messages.js"

export const Route = createFileRoute("/_admin/dashboard")({
  component: DashboardPage,
  head: () => ({ meta: seo({ title: m.nav_dashboard() }) })
})

function DashboardPage() {
  const user = useUser()

  return (
    <>
      <PageHeader
        title={
          <>
            {m.dashboard_welcome_back()}
            {user ? `, ${getFirstName(user.name)}` : ""}
          </>
        }
        description={m.dashboard_description()}
        meta={user?.role}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Section title={m.telegram_connect_title()}>
          <ConnectTelegram />
        </Section>
      </div>

      <UsageStats />
    </>
  )
}
