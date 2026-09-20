import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_admin/admin/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/users", replace: true })
  }
})
