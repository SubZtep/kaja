import { Cpu, LayoutDashboard, type LucideIcon, MessageCircle, Plug, Shield, Users } from "lucide-react"

/** "public" matches signed-out visitors; "all" matches every signed-in role plus "public". */
export type NavRole = "public" | "all" | "admin" | "user"

const matchesRole = (roles: NavRole[], role: string | null | undefined) =>
  roles.includes("all") || (role ? roles.includes(role as NavRole) : roles.includes("public"))

/** "header" items appear in the public site header; "admin" items appear in the admin sidebar/dashboard. */
export type NavSection = "header" | "admin"

export type NavItem = {
  label: string
  roles: NavRole[]
  sections: NavSection[]
  to?: string
  href?: string
  internal?: boolean
  desktopOnly?: boolean
  className?: string
  description?: string
  icon?: LucideIcon
}

const navItems: NavItem[] = [
  { label: "Home", to: "/", internal: true, roles: ["public"], sections: ["header"] },
  { label: "Sign In", to: "/signin", internal: true, roles: ["public"], sections: ["header"] },
  { label: "Sign Up", to: "/signup", internal: true, roles: ["public"], sections: ["header"] },
  {
    to: "/dashboard",
    label: "Dashboard",
    description: "Overview and shortcuts",
    internal: true,
    roles: ["admin", "user"],
    sections: ["header", "admin"],
    icon: LayoutDashboard
  },
  {
    to: "/profile",
    label: "Profile",
    description: "Account, email, and password",
    internal: true,
    roles: ["admin", "user"],
    sections: ["admin"],
    icon: Shield
  },
  {
    to: "/users",
    label: "Users",
    description: "Directory and access controls",
    internal: true,
    roles: ["admin"],
    sections: ["admin"],
    icon: Users
  },
  {
    to: "/mcp-servers",
    label: "MCP Servers",
    description: "Published mcp.toml servers",
    internal: true,
    roles: ["admin"],
    sections: ["admin"],
    icon: Plug
  },
  {
    to: "/models",
    label: "Models",
    description: "Providers and models.toml",
    internal: true,
    roles: ["admin"],
    sections: ["admin"],
    icon: Cpu
  },
  {
    to: "/widget",
    label: "Widget",
    description: "Embeddable chat widget keys",
    internal: true,
    roles: ["admin", "user"],
    sections: ["admin"],
    icon: MessageCircle
  },
  { label: "Docs", href: "https://docs.kaja.io", roles: ["all"], sections: ["header"] }
  // {
  //   label: "GitHub",
  //   href: "https://github.com/SubZtep/kaja",
  //   desktopOnly: true,
  //   className: "flex items-center gap-1.5 rounded-md border border-border bg-surface px-3.5 py-1.5 font-medium text-fg",
  //   roles: ["public"],
  //   sections: ["header"]
  // }
]

const getItems = (section: NavSection, role: string | null | undefined) =>
  navItems.filter(item => item.sections.includes(section) && matchesRole(item.roles, role))

export const getHeaderItems = (role: string | null | undefined) => getItems("header", role)

/** Every "admin" section item defines `to`, `description`, and `icon`. */
export type AdminNavItem = NavItem & { to: string; description: string; icon: LucideIcon }

export const getNavItems = (role: string | null | undefined) => getItems("admin", role) as AdminNavItem[]

/** Dashboard shortcuts omit the dashboard route itself. */
export const getDashboardLinks = (role: string | null | undefined) =>
  getNavItems(role).filter(item => item.to !== "/dashboard")
