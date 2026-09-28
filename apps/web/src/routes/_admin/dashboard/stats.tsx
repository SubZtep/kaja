import { createFileRoute } from "@tanstack/react-router"
import { UsageStats } from "../../../components/stats/UsageStats"
import { PageHeader } from "../../../components/ui/PageHeader"
import { seo } from "../../../lib/seo"
import { m } from "../../../paraglide/messages.js"

export const Route = createFileRoute("/_admin/dashboard/stats")({
  component: StatsPage,
  head: () => ({ meta: seo({ title: m.nav_stats() }) })
})

function StatsPage() {
  return (
    <>
      <PageHeader title={m.stats_title()} />
      <UsageStats />
    </>
  )
}
