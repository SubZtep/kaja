import { m } from "../../paraglide/messages.js"

/** An internal link (`to`) or an external one (`href`, opens in a new tab). */
export type NavItem = { label: string; to?: string; href?: string }

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
    { to: "/abilities", label: m.nav_abilities() },
    { to: "/widget", label: m.nav_widget() },
    ...(user.role === "admin" ? [{ to: "/admin", label: m.nav_admin() }] : [])
  ]
}

/** Tabs of the admin layout. */
export const getAdminItems = (): NavItem[] => [
  { to: "/admin/users", label: m.nav_users() },
  { to: "/admin/models", label: m.nav_models() }
]
