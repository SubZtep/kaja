import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_portal/channels/")({
  beforeLoad: () => {
    throw redirect({ to: "/channels/telegram", replace: true })
  }
})
