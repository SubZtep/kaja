import { type LucideIcon, UserCog } from "lucide-react"
import { m } from "../../paraglide/messages.js"

/** An internal link (`to`) or an external one (`href`, opens in a new tab); with an `icon` the desktop menu shows only the icon and `label` becomes its accessible name; `exact` marks a section's index tab, active only on its own path. */
export type NavItem = { label: string; icon?: LucideIcon; to?: string; href?: string; exact?: boolean }

/** Top menu: signed-out visitors get the public links; signed-in users get one item per section (its pages are tabs inside it), plus Admin for admins. */
export const getHeaderItems = (user: { role?: string | null } | null): NavItem[] => {
  // const home = { to: "/", label: m.nav_home() }
  if (!user) {
    return [
      // home,
      { to: "/signin", label: m.nav_sign_in() },
      { to: "/signup", label: m.nav_sign_up() },
      { href: "https://docs.kaja.io", label: m.nav_docs() }
    ]
  }
  return [
    // home,
    { to: "/dashboard", label: m.nav_dashboard() },
    { to: "/agent", label: m.nav_agent() },
    ...(user.role === "admin" ? [{ to: "/admin", label: m.nav_admin() }] : []),
    { to: "/profile", label: m.nav_profile(), icon: UserCog }
  ]
}

/** Tabs of the dashboard section. */
export const getDashboardItems = (): NavItem[] => [
  { to: "/dashboard", label: m.nav_overview(), exact: true },
  { to: "/dashboard/stats", label: m.nav_stats() }
]

/** Tabs of the agent section: what it can do and where it runs. */
export const getAgentItems = (): NavItem[] => [
  { to: "/agent/widget", label: m.nav_widget() },
  { to: "/agent/sandbox", label: m.nav_sandbox() }
]

/** Tabs of the admin layout. */
export const getAdminItems = (): NavItem[] => [
  { to: "/admin/dashboard", label: m.nav_dashboard() },
  { to: "/admin/users", label: m.nav_users() },
  { to: "/admin/models", label: m.nav_models() }
]
