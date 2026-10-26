import { createFileRoute, Outlet } from "@tanstack/react-router"
import { getAccountItems } from "../../components/layout/nav-items"
import { SectionTabs } from "../../components/layout/section-tabs"

export const Route = createFileRoute("/_portal/account")({
  component: AccountLayout
})

function AccountLayout() {
  return (
    <>
      <SectionTabs items={getAccountItems()} />
      <Outlet />
    </>
  )
}
