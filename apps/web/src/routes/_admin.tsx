import { createFileRoute, Outlet } from "@tanstack/react-router"
import { Menu } from "../components/layout/Menu"
import { userRequired } from "../lib/loaders"

export const Route = createFileRoute("/_admin")({
  component: AdminLayoutRoute,
  loader: () => userRequired()
})

function AdminLayoutRoute() {
  return (
    <main className="min-h-screen p-6 pb-24 md:ml-64 md:p-10 md:pb-10">
      <Menu className="mb-4" />
      <Outlet />
    </main>
  )
}
