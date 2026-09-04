import { createFileRoute, Outlet } from "@tanstack/react-router"
import { ContentWidth } from "../components/layout/ContentWidth"
import { SiteShell } from "../components/layout/SiteShell"
import { userRequired } from "../lib/loaders"
import { Header } from "./_public/-components/header"

export const Route = createFileRoute("/_admin")({
  component: AdminLayoutRoute,
  loader: ({ location }) => userRequired(undefined, location.href)
})

function AdminLayoutRoute() {
  return (
    <SiteShell header={<Header />}>
      <ContentWidth as="main" className="flex-1 py-10 md:py-14">
        <Outlet />
      </ContentWidth>
    </SiteShell>
  )
}
