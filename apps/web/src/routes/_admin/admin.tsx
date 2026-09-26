import { createFileRoute, Link, Outlet } from "@tanstack/react-router"
import { getAdminItems } from "../../components/layout/nav-items"
import { userRequired } from "../../lib/loaders"

export const Route = createFileRoute("/_admin/admin")({
  component: AdminLayout,
  beforeLoad: () => userRequired("admin")
})

function AdminLayout() {
  return (
    <>
      <nav className="mb-6 flex gap-1 border-border border-b">
        {getAdminItems().map(item => (
          <Link
            key={item.to}
            to={item.to!}
            className="-mb-px border-b-2 px-3 py-2 text-sm hover:text-fg"
            activeProps={{ className: "border-neon text-fg" }}
            inactiveProps={{ className: "border-transparent text-muted" }}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </>
  )
}
