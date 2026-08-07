import { Link } from "@tanstack/react-router"
import { getNavItems } from "../../../components/layout/nav-items"
import { SignOutButton } from "../../../components/layout/SignOutButton"
import { SiteHeader } from "../../../components/layout/SiteHeader"
import { useUser } from "../../../hooks/user"

function NavLink({ to, label }: Readonly<{ to: string; label: string }>) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: to === "/dashboard" }}
      activeProps={{ className: "text-fg nav-line-active" }}
      className="nav-line hover:text-fg"
    >
      {label}
    </Link>
  )
}

function AdminMobileNav({
  items,
  user
}: Readonly<{
  items: ReturnType<typeof getNavItems>
  user: ReturnType<typeof useUser>
}>) {
  return (
    <>
      {items.map(item => (
        <NavLink key={item.to} to={item.to} label={item.label} />
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
  )
}

export function AdminHeader() {
  const user = useUser()
  const items = getNavItems(user?.role)

  return (
    <SiteHeader
      brandTo="/"
      desktopNav={
        <>
          {items.map(item => (
            <NavLink key={item.to} to={item.to} label={item.label} />
          ))}
          <SignOutButton />
        </>
      }
      mobileNav={<AdminMobileNav items={items} user={user} />}
    />
  )
}
