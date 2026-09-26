import { getDisplayName } from "@kaja/shared"
import { Link } from "@tanstack/react-router"
import { getHeaderItems, type NavItem } from "../../../components/layout/nav-items"
import { SignOutButton } from "../../../components/layout/SignOutButton"
import { SiteHeader, useCloseMobileNav } from "../../../components/layout/SiteHeader"
import { useUser } from "../../../hooks/user"

// Desktop shows an icon item as the bare icon (label as its accessible name); the mobile drawer shows both
function MenuItemContent({ item, compact }: Readonly<{ item: NavItem; compact?: boolean }>) {
  const Icon = item.icon
  if (!Icon) return item.label
  if (compact) return <Icon className="size-4" aria-hidden />
  return (
    <span className="inline-flex items-center gap-2">
      <Icon className="size-4" aria-hidden />
      {item.label}
    </span>
  )
}

function MenuItem({
  item,
  compact,
  onNavigate
}: Readonly<{ item: NavItem; compact?: boolean; onNavigate?: () => void }>) {
  const iconOnly = compact && item.icon
  const a11y = iconOnly ? { "aria-label": item.label, title: item.label } : {}
  const className = iconOnly ? "nav-stamp inline-flex items-center" : "nav-stamp"

  if (item.to) {
    return (
      <Link
        to={item.to}
        activeProps={{ className: "nav-stamp-active" }}
        className={className}
        onClick={onNavigate}
        {...a11y}
      >
        <MenuItemContent item={item} compact={compact} />
      </Link>
    )
  }

  return (
    <a href={item.href} target="_blank" rel="noopener" className={className} onClick={onNavigate} {...a11y}>
      <MenuItemContent item={item} compact={compact} />
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
            <MenuItem key={item.label} item={item} compact />
          ))}
          {user ? <SignOutButton /> : null}
        </>
      }
      mobileNav={<MobileNav menuItems={menuItems} user={user} />}
    />
  )
}
