import { createFileRoute, Outlet } from "@tanstack/react-router"
import { AuthShell } from "./-components/auth-shell"

export const Route = createFileRoute("/_public/device")({
  component: DeviceLayout
})

function DeviceLayout() {
  return (
    <AuthShell>
      <div className="flex flex-col items-center gap-6 rounded-xl border border-border bg-surface px-6 py-8 text-center shadow-[0_24px_60px_-20px_#000a] sm:px-8">
        <Outlet />
      </div>
    </AuthShell>
  )
}
