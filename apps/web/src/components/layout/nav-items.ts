import { Cpu, LayoutDashboard, type LucideIcon, Plug, Server, Shield, Users } from "lucide-react"

export type NavItem = {
  to: string
  label: string
  description: string
  roles: string[]
  icon: LucideIcon
}

const navItems: NavItem[] = [
  {
    to: "/dashboard",
    label: "Dashboard",
    description: "Overview and shortcuts",
    roles: ["admin", "user"],
    icon: LayoutDashboard
  },
  {
    to: "/nodes",
    label: "Nodes",
    description: "Connected CLI nodes and heartbeats",
    roles: ["admin", "user"],
    icon: Server
  },
  {
    to: "/profile",
    label: "Profile",
    description: "Account, email, and password",
    roles: ["admin", "user"],
    icon: Shield
  },
  {
    to: "/users",
    label: "Users",
    description: "Directory and access controls",
    roles: ["admin"],
    icon: Users
  },
  {
    to: "/mcp-servers",
    label: "MCP Servers",
    description: "Published mcp.toml servers",
    roles: ["admin"],
    icon: Plug
  },
  {
    to: "/models",
    label: "Models",
    description: "Providers and models.toml",
    roles: ["admin"],
    icon: Cpu
  }
]

export const getNavItems = (role: string | null | undefined) =>
  navItems.filter(item => Boolean(role && item.roles.includes(role)))

/** Dashboard shortcuts omit the dashboard route itself. */
export const getDashboardLinks = (role: string | null | undefined) =>
  getNavItems(role).filter(item => item.to !== "/dashboard")
