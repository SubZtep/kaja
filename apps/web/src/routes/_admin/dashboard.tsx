import { getFirstName } from "@kaja/shared"
import { createFileRoute, Link } from "@tanstack/react-router"
import { getDashboardLinks } from "../../components/layout/nav-items"
import { PageHeader } from "../../components/ui/PageHeader"
import { Section } from "../../components/ui/Section"
import { useUser } from "../../hooks/user"

export const Route = createFileRoute("/_admin/dashboard")({
  component: DashboardPage
})

function DashboardPage() {
  const user = useUser()
  const links = getDashboardLinks(user?.role)

  return (
    <>
      <PageHeader
        title={<>Welcome back{user ? `, ${getFirstName(user.name)}` : ""}</>}
        description="Manage nodes, models, and config for your Kaja platform."
        meta={user?.role}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {links.map(item => (
          <Link key={item.to} to={item.to} className="block hover:text-fg">
            <Section className="h-full transition-colors hover:border-neon/40">
              <div className="mb-3.5 flex size-8 items-center justify-center rounded-md border border-neon/25 bg-neon/15 text-neon">
                <item.icon size={16} />
              </div>
              <div className="mb-1.5 font-semibold text-fg text-[15px]">{item.label}</div>
              <div className="text-[13.5px] text-muted">{item.description}</div>
            </Section>
          </Link>
        ))}
      </div>
    </>
  )
}
