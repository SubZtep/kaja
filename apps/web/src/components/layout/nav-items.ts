import { type LucideIcon, MessageCircle, Settings, Shield, Sparkles } from "lucide-react"
import { m } from "../../paraglide/messages.js"

/** An internal link (`to`) or an external one (`href`, opens in a new tab). */
export type NavItem = { label: string; to?: string; href?: string }

/** A dashboard shortcut card. */
export type CardItem = { to: string; label: string; description: string; icon: LucideIcon }

/** Top menu: signed-out visitors get the public links, signed-in users the same list, plus the single Admin item (which holds every admin page) for admins. */
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
    { to: "/profile", label: m.nav_profile() },
    { to: "/packages", label: m.nav_packages() },
    { to: "/widget", label: m.nav_widget() },
    ...(user.role === "admin" ? [{ to: "/admin", label: m.nav_admin() }] : [])
  ]
}

/** Dashboard shortcut cards; the Admin card is for admins only. */
export const getDashboardLinks = (role: string | null | undefined): CardItem[] => [
  { to: "/profile", label: m.nav_profile(), description: m.nav_profile_desc(), icon: Shield },
  { to: "/packages", label: m.nav_packages(), description: m.nav_packages_desc(), icon: Sparkles },
  { to: "/widget", label: m.nav_widget(), description: m.nav_widget_desc(), icon: MessageCircle },
  ...(role === "admin" ? [{ to: "/admin", label: m.nav_admin(), description: m.nav_admin_desc(), icon: Settings }] : [])
]

/** Tabs of the admin layout. */
export const getAdminItems = (): NavItem[] => [
  { to: "/admin/users", label: m.nav_users() },
  { to: "/admin/mcp-servers", label: m.nav_mcp_servers() },
  { to: "/admin/models", label: m.nav_models() }
]
