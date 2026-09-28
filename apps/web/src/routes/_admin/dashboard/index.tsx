import { getFirstName } from "@kaja/shared/text"
import { createFileRoute } from "@tanstack/react-router"
import { SandboxSummary } from "../../../components/sandbox/SandboxSummary"
import { PageHeader } from "../../../components/ui/PageHeader"
import { Section } from "../../../components/ui/Section"
import { SignedInDevices } from "../../../components/user/SignedInDevices"
import { TelegramStatus } from "../../../components/user/TelegramStatus"
import { useUser } from "../../../hooks/user"
import { seo } from "../../../lib/seo"
import { m } from "../../../paraglide/messages.js"

export const Route = createFileRoute("/_admin/dashboard/")({
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
            {getFirstName(user?.name, ", ")}
          </>
        }
        description={m.dashboard_description()}
        meta={user?.role}
      />

      {/* Where the account is in use; the activity numbers live on the Stats tab */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Section className="self-start lg:col-span-2" title={m.devices_title()}>
          <SignedInDevices />
        </Section>
        <div className="grid content-start gap-6">
          <Section title={m.telegram_connect_title()}>
            <TelegramStatus />
          </Section>
          <Section title={m.sandbox_summary_title()}>
            <SandboxSummary />
          </Section>
        </div>
      </div>
    </>
  )
}
