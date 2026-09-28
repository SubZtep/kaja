import { createFileRoute, Outlet } from "@tanstack/react-router"
import { getAgentItems } from "../../components/layout/nav-items"
import { SectionTabs } from "../../components/layout/SectionTabs"

export const Route = createFileRoute("/_admin/agent")({
  component: AgentLayout
})

/** What the agent can do and where it runs: abilities, widget keys, sandboxes. */
function AgentLayout() {
  return (
    <>
      <SectionTabs items={getAgentItems()} />
      <Outlet />
    </>
  )
}
