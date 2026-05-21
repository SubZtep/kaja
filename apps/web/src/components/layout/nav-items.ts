import { LayoutDashboard, type LucideIcon, Server, Shield, Users } from "lucide-react"

type Surface = "menu" | "sidebar" | "mobile"
type LayoutNavItem = {
  to: string
  label: string
  surfaces: Surface[]
  roles?: string[]
  icon?: LucideIcon
  mobileLabel?: string
}

const layoutNavItems: LayoutNavItem[] = [
  {
    to: "/",
    label: "Home",
    surfaces: ["menu"]
  },
  {
    to: "/signin",
    label: "Sign In",
    surfaces: ["menu"]
  },
  {
    to: "/signup",
    label: "Sign Up",
    surfaces: ["menu"]
  },
  {
    to: "/dashboard",
    label: "Dashboard",
    mobileLabel: "Dash",
    roles: ["admin", "user"],
    icon: LayoutDashboard,
    surfaces: ["menu", "sidebar", "mobile"]
  },
  {
    to: "/nodes",
    label: "Nodes",
    roles: ["admin", "user"],
    icon: Server,
    surfaces: ["menu", "sidebar", "mobile"]
  },
  {
    to: "/profile",
    label: "Profile",
    roles: ["admin", "user"],
    icon: Shield,
    surfaces: ["menu", "sidebar", "mobile"]
  },
  {
    to: "/users",
    label: "Users",
    roles: ["admin"],
    icon: Users,
    surfaces: ["menu", "sidebar", "mobile"]
  }
]
type IconNavItem = LayoutNavItem & { icon: LucideIcon }

const canAccess = (item: LayoutNavItem, role: string | null | undefined) => {
  if (!item.roles) return !role
  return Boolean(role && item.roles.includes(role))
}

const isOnSurface = (item: LayoutNavItem, surface: Surface) => item.surfaces.includes(surface)

const hasIcon = (item: LayoutNavItem): item is IconNavItem => "icon" in item

export const getMenuItems = (role: string | null | undefined) =>
  layoutNavItems.filter(item => isOnSurface(item, "menu") && canAccess(item, role))

export const getSidebarItems = (role: string | null | undefined) =>
  layoutNavItems.filter(item => isOnSurface(item, "sidebar") && canAccess(item, role)).filter(hasIcon) as IconNavItem[]

export const getMobileNavItems = (role: string | null | undefined) =>
  layoutNavItems
    .filter(item => isOnSurface(item, "mobile") && canAccess(item, role))
    .filter(hasIcon)
    .map(item => ({
      to: item.to,
      label: item.mobileLabel ?? item.label,
      icon: item.icon
    }))
