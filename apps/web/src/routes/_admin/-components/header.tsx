import { Link } from "@tanstack/react-router"
import { getNavItems } from "../../../components/layout/nav-items"
import { SignOutButton } from "../../../components/layout/SignOutButton"
import { SiteHeader } from "../../../components/layout/SiteHeader"
import { useUser } from "../../../hooks/user"

function NavLink({ to, label, onNavigate }: Readonly<{ to: string; label: string; onNavigate?: () => void }>) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: to === "/dashboard" }}
      activeProps={{ className: "text-fg" }}
      className="hover:text-fg"
      onClick={onNavigate}
    >
      {label}
    </Link>
  )
}

export function AdminHeader() {
  const user = useUser()
  const items = getNavItems(user?.role)

  return (
    <SiteHeader
      brandTo="/dashboard"
      desktopNav={
        <>
          {items.map(item => (
            <NavLink key={item.to} to={item.to} label={item.label} />
          ))}
          <SignOutButton />
        </>
      }
      mobileNav={close => (
        <>
          {items.map(item => (
            <NavLink key={item.to} to={item.to} label={item.label} onNavigate={close} />
          ))}
          {user ? (
            <div className="flex items-center justify-between border-border border-t pt-4">
              <div className="min-w-0">
                <div className="truncate font-medium text-fg text-sm">{user.name}</div>
                <div className="truncate text-[#6e7681] text-xs capitalize">{user.role ?? "user"}</div>
              </div>
              <SignOutButton />
            </div>
          ) : null}
        </>
      )}
    />
  )
}
