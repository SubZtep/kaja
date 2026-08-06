import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { SignOutButton } from "../../../components/layout/SignOutButton"
import { SiteHeader } from "../../../components/layout/SiteHeader"
import { useUser } from "../../../hooks/user"

type HeaderMenuItem = {
  label: string
  to?: string
  href?: string
  internal?: boolean
  desktopOnly?: boolean
  className?: string
  icon?: ReactNode
}

const guestItems: HeaderMenuItem[] = [
  { label: "Home", to: "/", internal: true },
  { label: "Sign In", to: "/signin", internal: true },
  { label: "Sign Up", to: "/signup", internal: true }
]

const authedItems: HeaderMenuItem[] = [
  { label: "Home", to: "/", internal: true },
  { label: "Dashboard", to: "/dashboard", internal: true }
]

const sharedItems: HeaderMenuItem[] = [
  { label: "Docs", href: "https://docs.kaja.io" },
  {
    label: "GitHub",
    href: "https://github.com/SubZtep/kaja",
    desktopOnly: true,
    className: "flex items-center gap-1.5 rounded-md border border-border bg-surface px-3.5 py-1.5 font-medium text-fg"
  }
]

function MenuItem({ item, onNavigate }: Readonly<{ item: HeaderMenuItem; onNavigate?: () => void }>) {
  if (item.internal) {
    return (
      <Link to={item.to!} onClick={onNavigate}>
        {item.label}
      </Link>
    )
  }

  return (
    <a href={item.href} target="_blank" rel="noopener" className={item.className} onClick={onNavigate}>
      {item.label}
      {item.icon}
    </a>
  )
}

export function Header() {
  const user = useUser()
  const menuItems = [...(user ? authedItems : guestItems), ...sharedItems]

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
      mobileNav={close => (
        <>
          {menuItems
            .filter(item => !item.desktopOnly)
            .map(item => (
              <MenuItem key={item.label} item={item} onNavigate={close} />
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
