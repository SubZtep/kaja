import { createFileRoute, Outlet } from "@tanstack/react-router"
import { Menu } from "../components/layout/Menu"
import { userRequired } from "../lib/loaders"

export const Route = createFileRoute("/_admin")({
  component: AdminLayoutRoute,
  loader: () => userRequired()
})

function AdminLayoutRoute() {
  return (
    <main className="min-h-screen flex flex-col">
      <Menu />
      <Outlet />
    </main>
  )
}
