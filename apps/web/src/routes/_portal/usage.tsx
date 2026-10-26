import { createFileRoute } from "@tanstack/react-router"
import { UsageStats } from "../../components/stats/usage-stats"
import { PageHeader } from "../../components/ui/page-header"
import { seo } from "../../lib/seo"
import { m } from "../../paraglide/messages.js"

export const Route = createFileRoute("/_portal/usage")({
  component: StatsPage,
  head: () => ({ meta: seo({ title: m.nav_usage() }) })
})

function StatsPage() {
  return (
    <>
      <PageHeader title={m.stats_title()} />
      <UsageStats />
    </>
  )
}
