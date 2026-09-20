import { getDisplayName } from "@kaja/shared"
import { Link } from "@tanstack/react-router"
import { getHeaderItems, type NavItem } from "../../../components/layout/nav-items"
import { SignOutButton } from "../../../components/layout/SignOutButton"
import { SiteHeader, useCloseMobileNav } from "../../../components/layout/SiteHeader"
import { useUser } from "../../../hooks/user"

function MenuItem({ item, onNavigate }: Readonly<{ item: NavItem; onNavigate?: () => void }>) {
  if (item.to) {
    return (
      <Link to={item.to} activeProps={{ className: "nav-stamp-active" }} className="nav-stamp" onClick={onNavigate}>
        {item.label}
      </Link>
    )
  }

  return (
    <a href={item.href} target="_blank" rel="noopener" className="nav-stamp" onClick={onNavigate}>
      {item.label}
    </a>
  )
}

function MobileNav({ menuItems, user }: Readonly<{ menuItems: NavItem[]; user: ReturnType<typeof useUser> }>) {
  const close = useCloseMobileNav()

  return (
    <>
      {menuItems.map(item => (
        <MenuItem key={item.label} item={item} onNavigate={close} />
      ))}
      {user ? (
        <div className="flex items-center justify-between pt-4">
          <div className="min-w-0">
            <div className="truncate font-display font-bold text-fg text-sm">{getDisplayName(user)}</div>
            <div className="truncate font-crt text-muted text-xs capitalize">{user.role ?? "user"}</div>
          </div>
          <SignOutButton onClick={close} />
        </div>
      ) : null}
    </>
  )
}

export function Header() {
  const user = useUser()
  const menuItems = getHeaderItems(user)

  return (
    <SiteHeader
      brandTo="/"
      desktopNav={
        <>
          {menuItems.map(item => (
            <MenuItem key={item.label} item={item} />
          ))}
          {user ? <SignOutButton /> : null}
        </>
      }
      mobileNav={<MobileNav menuItems={menuItems} user={user} />}
    />
  )
}
