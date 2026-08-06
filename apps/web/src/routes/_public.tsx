import { createFileRoute, Outlet } from "@tanstack/react-router"
import { Footer } from "./_public/-components/footer"
import { Header } from "./_public/-components/header"

export const Route = createFileRoute("/_public")({
  component: PublicLayout
})

function PublicLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-bg font-body leading-normal text-muted">
      <Header />
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
      <Footer />
    </div>
  )
}
