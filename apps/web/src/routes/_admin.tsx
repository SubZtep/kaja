import { createFileRoute, Outlet } from "@tanstack/react-router"
import { MobileNav } from "../components/layout/MobileNav"
import { Sidebar } from "../components/layout/Sidebar"
import { userRequired } from "../lib/loaders"

export const Route = createFileRoute("/_admin")({
  component: AdminLayoutRoute,
  loader: () => userRequired()
})

function AdminLayoutRoute() {
  return (
    <>
      <Sidebar />
      <main className="min-h-screen p-6 pb-24 md:ml-64 md:p-10 md:pb-10">
        <Outlet />
      </main>
      <MobileNav />
    </>
  )
}
