import { createFileRoute, Outlet } from "@tanstack/react-router"
import { SiteShell } from "../components/layout/SiteShell"
import { Footer } from "./_public/-components/footer"
import { Header } from "./_public/-components/header"

export const Route = createFileRoute("/_public")({
  component: PublicLayout
})

function PublicLayout() {
  return (
    <SiteShell header={<Header />} footer={<Footer />}>
      <Outlet />
    </SiteShell>
  )
}
