import type { LucideIcon } from "lucide-react"
import { m } from "../../paraglide/messages.js"

/**
 * An internal link (`to`) or an external one (`href`, opens in a new tab); with an `icon` the desktop menu shows only
 * the icon and `label` becomes its accessible name; `exact` marks a section's index tab, active only on its own path;
 * `badge` adds an attention dot.
 */
export type NavItem = {
  label: string
  icon?: LucideIcon
  to?: string
  href?: string
  exact?: boolean
  badge?: boolean
}

/**
 * Top menu: signed-out visitors get the public links; signed-in users get one item per section (its pages are tabs
 * inside it), plus Admin for admins.
 */
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
    { to: "/home", label: m.nav_home() },
    { to: "/channels", label: m.nav_channels() },
    { to: "/sandboxes", label: m.nav_sandboxes() },
    { to: "/usage", label: m.nav_usage() },
    { to: "/account", label: m.nav_account() },
    ...(user.role === "admin" ? [{ to: "/admin", label: m.nav_admin() }] : [])
  ]
}

/** Tabs of the channels section: the ways to talk to Kaja. */
export const getChannelItems = (): NavItem[] => [
  { to: "/channels/telegram", label: m.nav_telegram() },
  { to: "/channels/widgets", label: m.nav_widgets() }
]

/** Tabs of the account section. */
export const getAccountItems = (): NavItem[] => [
  { to: "/account/profile", label: m.nav_profile() },
  { to: "/account/devices", label: m.nav_devices() }
]

/** Tabs of the admin layout. */
export const getAdminItems = (): NavItem[] => [
  { to: "/admin/status", label: m.nav_status() },
  { to: "/admin/users", label: m.nav_users() },
  { to: "/admin/images", label: m.nav_images() },
  { to: "/admin/models", label: m.nav_models() }
]
