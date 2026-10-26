import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_portal/agent/")({
  beforeLoad: () => {
    throw redirect({ to: "/agent/widget", replace: true })
  }
})
