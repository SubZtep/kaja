import { createFileRoute, Outlet } from "@tanstack/react-router"
import { getAgentItems } from "../../components/layout/nav-items"
import { SectionTabs } from "../../components/layout/section-tabs"

export const Route = createFileRoute("/_portal/agent")({
  component: AgentLayout
})

/** What the agent can do and where it runs: abilities, widgets, sandboxes. */
function AgentLayout() {
  return (
    <>
      <SectionTabs items={getAgentItems()} />
      <Outlet />
    </>
  )
}
