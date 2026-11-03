import { getFirstName } from "@kaja/shared/text"
import { createFileRoute } from "@tanstack/react-router"
import { SandboxSummary } from "../../components/sandbox/sandbox-summary"
import { PageHeader } from "../../components/ui/page-header"
import { Section } from "../../components/ui/section"
import { ConnectTelegram } from "../../components/user/connect-telegram"
import { TelegramStatus } from "../../components/user/telegram-status"
import { useTelegramNudge } from "../../hooks/telegram-link"
import { useUser } from "../../hooks/user"
import { seo } from "../../lib/seo"
import { m } from "../../paraglide/messages.js"

export const Route = createFileRoute("/_portal/home")({
  component: HomePage,
  head: () => ({ meta: seo({ title: m.nav_home() }) })
})

function HomePage() {
  const user = useUser()
  const nudge = useTelegramNudge()

  return (
    <>
      <PageHeader
        title={
          <>
            {m.home_welcome_back()}
            {getFirstName(user?.name, ", ")}
          </>
        }
        description={m.home_description()}
        meta={user?.role}
      />

      {/* The first thing to do, until it is done; afterwards it is just one of the status cards below */}
      {nudge ? (
        <Section className="mb-6" title={m.telegram_nudge_title()}>
          <ConnectTelegram />
        </Section>
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {nudge ? null : (
          <Section className="self-start" title={m.telegram_title()}>
            <TelegramStatus />
          </Section>
        )}
        <Section className="self-start" title={m.sandbox_summary_title()}>
          <SandboxSummary />
        </Section>
      </div>
    </>
  )
}
