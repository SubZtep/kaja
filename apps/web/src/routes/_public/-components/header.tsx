import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { SiteHeader } from "../../../components/layout/SiteHeader"

type HeaderMenuItem = {
  label: string
  to?: string
  href?: string
  internal?: boolean
  desktopOnly?: boolean
  className?: string
  icon?: ReactNode
}

const menuItems: HeaderMenuItem[] = [
  { label: "Home", to: "/", internal: true },
  { label: "Sign In", to: "/signin", internal: true },
  { label: "Sign Up", to: "/signup", internal: true },
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
  return (
    <SiteHeader
      brandTo="/"
      desktopNav={menuItems.map(item => <MenuItem key={item.label} item={item} />)}
      mobileNav={close =>
        menuItems
          .filter(item => !item.desktopOnly)
          .map(item => <MenuItem key={item.label} item={item} onNavigate={close} />)
      }
    />
  )
}
