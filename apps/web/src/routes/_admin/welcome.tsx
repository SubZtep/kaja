import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { Button } from "../../components/form/primitives/Button"
import { type PackageTab, PackageTabs } from "../../components/packages/PackageTabs"
import { PageHeader } from "../../components/ui/PageHeader"
import { seo } from "../../lib/seo"
import { m } from "../../paraglide/messages.js"

export const Route = createFileRoute("/_admin/welcome")({
  component: WelcomePage,
  head: () => ({ meta: seo({ title: m.welcome_title() }) })
})

/** Right after signup: pick skills and tools (each toggle saves on its own), then on to the dashboard. */
function WelcomePage() {
  const [tab, setTab] = useState<PackageTab>("skills")
  return (
    <>
      <PageHeader title={m.welcome_title()} description={m.welcome_description()} />
      <PackageTabs tab={tab} onTabChange={setTab} />
      <div className="mt-8 flex flex-wrap items-center gap-4">
        <Button variant="primary" render={<Link to="/dashboard" />}>
          {m.welcome_continue()}
        </Button>
        <Link to="/dashboard" className="text-muted text-sm hover:text-fg">
          {m.welcome_skip()}
        </Link>
      </div>
    </>
  )
}
