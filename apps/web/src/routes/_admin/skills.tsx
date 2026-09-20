import { createFileRoute, redirect } from "@tanstack/react-router"

// The skills page grew into /abilities (Skills and Tools tabs); old links land on its Skills tab.
export const Route = createFileRoute("/_admin/skills")({
  beforeLoad: () => {
    throw redirect({ to: "/abilities", search: { tab: "skills" }, replace: true })
  }
})
