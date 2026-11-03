import { createFileRoute } from "@tanstack/react-router"
import { PageHeader } from "../../../components/ui/page-header"
import { Section } from "../../../components/ui/section"
import { TelegramStatus } from "../../../components/user/telegram-status"
import { seo } from "../../../lib/seo"
import { m } from "../../../paraglide/messages.js"

export const Route = createFileRoute("/_portal/channels/telegram")({
  component: TelegramPage,
  head: () => ({ meta: seo({ title: m.nav_telegram() }) })
})

function TelegramPage() {
  return (
    <>
      <PageHeader title={m.telegram_title()} description={m.telegram_page_description()} />
      <Section className="max-w-xl" title={m.telegram_connect_title()}>
        <TelegramStatus />
      </Section>
    </>
  )
}
