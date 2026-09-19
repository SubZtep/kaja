import { createFileRoute, redirect } from "@tanstack/react-router"

// The skills page grew into /packages (Skills and Tools tabs); old links land on its Skills tab.
export const Route = createFileRoute("/_admin/skills")({
  beforeLoad: () => {
    throw redirect({ to: "/packages", search: { tab: "skills" }, replace: true })
  }
})
