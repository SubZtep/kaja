import { getFirstName } from "@kaja/shared"
import { createFileRoute } from "@tanstack/react-router"
import { Activity, TrendingUp, UserCheck, Users } from "lucide-react"
import { useUser } from "#/hooks/user"

export const Route = createFileRoute("/_admin/dashboard")({
  component: DashboardPage
})

function DashboardPage() {
  const user = useUser()

  return (
    <>
      <header className="mb-12">
        <h2 className="my-0 mb-4 text-5xl font-headline font-bold tracking-tighter text-neon neon-glow">
          Welcome back{user ? `, ${getFirstName(user.name)}` : ""}
        </h2>
        <p className="max-w-lg text-lg leading-relaxed text-muted">Here's what's happening with your platform today.</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <StatCard icon={Users} label="Total Users" value="--" accent="primary" />
        <StatCard icon={UserCheck} label="Verified" value="--" accent="tertiary" />
        <StatCard icon={Activity} label="System Health" value="99.9%" accent="primary" />
        <StatCard icon={TrendingUp} label="Growth Rate" value="--" accent="tertiary" />
      </div>

      <section className="rounded-2xl bg-surface p-8 shadow-2xl">
        <h3 className="mb-2 text-lg font-headline font-bold text-fg">Quick Actions</h3>
        <p className="leading-relaxed text-muted">
          Navigate to the User Directory to manage users, or check your Profile settings.
        </p>
      </section>
    </>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent
}: Readonly<{
  icon: React.ComponentType<{ size?: number }>
  label: string
  value: string
  accent: "primary" | "tertiary"
}>) {
  const borderClass = accent === "primary" ? "border-neon" : "border-ice"
  const valueClass = accent === "primary" ? "text-neon" : "text-ice"

  return (
    <div className={`rounded-xl border-t-2 bg-surface p-6 ${borderClass}`}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted">{label}</p>
        <Icon size={16} /*className={valueClass}*/ />
      </div>
      <p className={`text-3xl font-bold font-headline neon-glow ${valueClass}`}>{value}</p>
    </div>
  )
}
