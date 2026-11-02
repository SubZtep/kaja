import { getDisplayName } from "@kaja/shared/text"
import { Link } from "@tanstack/react-router"
import { getHeaderItems, type NavItem } from "../../../components/layout/nav-items"
import { SignOutButton } from "../../../components/layout/sign-out-button"
import { SiteHeader, useCloseMobileNav } from "../../../components/layout/site-header"
import { useTelegramNudge } from "../../../hooks/telegram-link"
import { useUser } from "../../../hooks/user"

function MenuItemContent({ item }: Readonly<{ item: NavItem }>) {
  if (!item.badge) return item.label
  return (
    <span className="inline-flex items-center gap-1.5">
      {item.label}
      <span className="bg-neon size-1.5 rounded-full" aria-hidden />
    </span>
  )
}

function MenuItem({ item, onNavigate }: Readonly<{ item: NavItem; onNavigate?: () => void }>) {
  if (item.to) {
    return (
      <Link to={item.to} activeProps={{ className: "nav-stamp-active" }} className="nav-stamp" onClick={onNavigate}>
        <MenuItemContent item={item} />
      </Link>
    )
  }

  return (
    <a href={item.href} target="_blank" rel="noopener" className="nav-stamp" onClick={onNavigate}>
      <MenuItemContent item={item} />
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
        // Who is signed in, then signing out on its own line, under the same dashed rule as the auth card's footer
        <div className="border-border mt-2 flex w-full flex-col items-start gap-3 border-t border-dashed pt-4">
          <div className="w-full min-w-0 px-2">
            <div className="font-display text-fg truncate text-sm font-extrabold">{getDisplayName(user)}</div>
            <div className="font-crt text-muted truncate text-xs capitalize">{user.role ?? "user"}</div>
          </div>
          <SignOutButton />
        </div>
      ) : null}
    </>
  )
}

export function Header() {
  const user = useUser()
  const nudge = useTelegramNudge()
  const menuItems = getHeaderItems(user).map(item => (item.to === "/channels" ? { ...item, badge: nudge } : item))

  return (
    <SiteHeader
      brandTo="/"
      desktopNav={
        <>
          {menuItems.map(item => (
            <MenuItem key={item.label} item={item} />
          ))}
          {user ? <SignOutButton compact /> : null}
        </>
      }
      mobileNav={<MobileNav menuItems={menuItems} user={user} />}
    />
  )
}
