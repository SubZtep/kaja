import { Link } from "@tanstack/react-router"
import { getHeaderItems, type NavItem } from "../../../components/layout/nav-items"
import { SignOutButton } from "../../../components/layout/SignOutButton"
import { SiteHeader } from "../../../components/layout/SiteHeader"
import { useUser } from "../../../hooks/user"

function MenuItem({ item, onNavigate }: Readonly<{ item: NavItem; onNavigate?: () => void }>) {
  if (item.internal) {
    return (
      <Link
        to={item.to!}
        activeProps={{ className: "text-fg nav-line-active" }}
        className="nav-line hover:text-fg"
        onClick={onNavigate}
      >
        {item.label}
      </Link>
    )
  }

  return (
    <a
      href={item.href}
      target="_blank"
      rel="noopener"
      className={item.className ?? "nav-line hover:text-fg"}
      onClick={onNavigate}
    >
      {item.label}
    </a>
  )
}

function MobileNav({
  menuItems,
  user,
  onNavigate
}: Readonly<{ menuItems: NavItem[]; user: ReturnType<typeof useUser>; onNavigate: () => void }>) {
  return (
    <>
      {menuItems
        .filter(item => !item.desktopOnly)
        .map(item => (
          <MenuItem key={item.label} item={item} onNavigate={onNavigate} />
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

export function Header() {
  const user = useUser()
  const menuItems = getHeaderItems(user?.role)

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
      mobileNav={close => <MobileNav menuItems={menuItems} user={user} onNavigate={close} />}
    />
  )
}
