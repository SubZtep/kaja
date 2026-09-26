import { type LucideIcon, UserCog } from "lucide-react"
import { m } from "../../paraglide/messages.js"

/** An internal link (`to`) or an external one (`href`, opens in a new tab); with an `icon` the desktop menu shows only the icon and `label` becomes its accessible name. */
export type NavItem = { label: string; icon?: LucideIcon; to?: string; href?: string }

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
    { to: "/abilities", label: m.nav_abilities() },
    { to: "/widget", label: m.nav_widget() },
    ...(user.role === "admin" ? [{ to: "/admin", label: m.nav_admin() }] : []),
    { to: "/profile", label: m.nav_profile(), icon: UserCog }
  ]
}

/** Tabs of the admin layout. */
export const getAdminItems = (): NavItem[] => [
  { to: "/admin/dashboard", label: m.nav_dashboard() },
  { to: "/admin/users", label: m.nav_users() },
  { to: "/admin/models", label: m.nav_models() }
]
