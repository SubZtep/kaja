import { createFileRoute } from "@tanstack/react-router"
import { PageHeader } from "../../../../components/ui/page-header"
import { seo } from "../../../../lib/seo"
import { m } from "../../../../paraglide/messages.js"
import { MarketplaceSection, ServiceKeysSection } from "./-components/marketplace-section"
import { SandboxSection } from "./-components/sandbox-section"
import { StorageSection } from "./-components/storage-section"

export const Route = createFileRoute("/_admin/admin/dashboard/")({
  component: AdminDashboard,
  head: () => ({ meta: seo({ title: m.nav_dashboard() }) })
})

function AdminDashboard() {
  return (
    <>
      <PageHeader title={m.nav_dashboard()} description={m.admin_dashboard_description()} />
      <MarketplaceSection />
      <ServiceKeysSection />
      <SandboxSection />
      <StorageSection />
    </>
  )
}
