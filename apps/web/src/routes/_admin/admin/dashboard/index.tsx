import { createFileRoute } from "@tanstack/react-router"
import { PageHeader } from "../../../../components/ui/PageHeader"
import { seo } from "../../../../lib/seo"
import { m } from "../../../../paraglide/messages.js"
import { SandboxSection } from "./-components/SandboxSection"

export const Route = createFileRoute("/_admin/admin/dashboard/")({
  component: AdminDashboard,
  head: () => ({ meta: seo({ title: m.nav_dashboard() }) })
})

function AdminDashboard() {
  return (
    <>
      <PageHeader title={m.nav_dashboard()} description={m.admin_dashboard_description()} />
      <SandboxSection />
    </>
  )
}
