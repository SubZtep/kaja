import { createFileRoute, Link } from "@tanstack/react-router"
import { AbilitySections } from "../../components/abilities/AbilitySections"
import { Button } from "../../components/form/primitives/Button"
import { PageHeader } from "../../components/ui/PageHeader"
import { seo } from "../../lib/seo"
import { m } from "../../paraglide/messages.js"

export const Route = createFileRoute("/_admin/welcome")({
  component: WelcomePage,
  head: () => ({ meta: seo({ title: m.welcome_title() }) })
})

/** Right after signup: pick skills and tools (each toggle saves on its own), then on to the dashboard. */
function WelcomePage() {
  return (
    <>
      <PageHeader title={m.welcome_title()} description={m.welcome_description()} />
      <AbilitySections />
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
