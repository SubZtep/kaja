import { createFileRoute, Outlet } from "@tanstack/react-router"
import { SiteShell } from "../components/layout/SiteShell"
import { Footer } from "./_public/-components/footer"
import { GritDefs } from "./_public/-components/grit-defs"
import { Header } from "./_public/-components/header"

export const Route = createFileRoute("/_public")({
  component: PublicLayout
})

function PublicLayout() {
  return (
    <SiteShell className="public-grit" header={<Header />} footer={<Footer />}>
      <GritDefs />
      <Outlet />
    </SiteShell>
  )
}
