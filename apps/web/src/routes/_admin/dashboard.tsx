import { createFileRoute, Outlet } from "@tanstack/react-router"
import { getDashboardItems } from "../../components/layout/nav-items"
import { SectionTabs } from "../../components/layout/section-tabs"

export const Route = createFileRoute("/_admin/dashboard")({
  component: DashboardLayout
})

function DashboardLayout() {
  return (
    <>
      <SectionTabs items={getDashboardItems()} />
      <Outlet />
    </>
  )
}
