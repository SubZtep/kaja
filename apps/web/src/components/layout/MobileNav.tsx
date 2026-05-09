import { Link } from "@tanstack/react-router"
import { useUser } from "#/hooks/user"
import { getMobileNavItems } from "./nav-items"

export function MobileNav() {
  const role = useUser()?.role
  const mobileNavItems = getMobileNavItems(role)

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-bg border-t border-border/40 h-16 flex items-center justify-around z-50 px-6">
      {mobileNavItems.map(item => (
        <Link
          key={item.to}
          to={item.to}
          className="flex flex-col items-center gap-1 text-muted"
          activeProps={{ className: "text-neon" }}
        >
          <item.icon size={20} />
          <span className="text-[10px] font-bold uppercase tracking-tight">{item.label}</span>
        </Link>
      ))}
    </nav>
  )
}
