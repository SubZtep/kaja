import { createFileRoute, Outlet } from "@tanstack/react-router"
import { getAdminItems } from "../../components/layout/nav-items"
import { SectionTabs } from "../../components/layout/section-tabs"
import { userRequired } from "../../lib/loaders"

export const Route = createFileRoute("/_admin/admin")({
  component: AdminLayout,
  beforeLoad: ({ context }) => userRequired(context.session, "admin")
})

function AdminLayout() {
  return (
    <>
      <SectionTabs items={getAdminItems()} />
      <Outlet />
    </>
  )
}
