import { Link } from "@tanstack/react-router"
import { Menu, X } from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"

type HeaderMenuItem = {
  label: string
  to?: string
  href?: string
  internal?: boolean
  external?: boolean
  desktopOnly?: boolean
  className?: string
  icon?: ReactNode
}

const menuItems: HeaderMenuItem[] = [
  { label: "Home", to: "/", internal: true },
  { label: "Sign In", to: "/signin", internal: true },
  { label: "Sign Up", to: "/signup", internal: true },
  { label: "Docs", href: "https://docs.kaja.io", external: true },
  {
    label: "GitHub",
    href: "https://github.com/SubZtep/kaja",
    external: true,
    desktopOnly: true,
    className: "flex items-center gap-1.5 rounded-md border border-border bg-surface px-3.5 py-1.5 font-medium text-fg"
  }
]

function renderMenuItem(item: HeaderMenuItem, onNavigate?: () => void) {
  if (item.internal) {
    return (
      <Link key={item.label} to={item.to!} onClick={onNavigate}>
        {item.label}
      </Link>
    )
  }

  return (
    <a key={item.label} href={item.href} target="_blank" rel="noopener" className={item.className} onClick={onNavigate}>
      {item.label}
      {item.icon}
    </a>
  )
}

export function Header() {
  const [open, setOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    const onClickOutside = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) setOpen(false)
    }

    document.addEventListener("keydown", onKeyDown)
    document.addEventListener("mousedown", onClickOutside)
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.removeEventListener("mousedown", onClickOutside)
    }
  }, [open])

  return (
    <header ref={headerRef} className="sticky top-0 z-10 border-border border-b bg-bg/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-280 items-center justify-between px-6 py-4.5">
        <div className="flex items-center gap-2 font-mono font-bold text-lg text-fg">
          <Link to="/">
            <span className="text-neon">&gt;</span> kaja
          </Link>
        </div>
        <nav className="hidden items-center gap-7 text-muted text-sm md:flex">
          {menuItems.map(item => renderMenuItem(item))}
        </nav>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="flex items-center justify-center rounded-md border border-border bg-surface p-2 text-fg md:hidden"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>
      {open && (
        <nav className="flex flex-col gap-4 border-border border-t bg-bg px-6 py-5 text-muted text-sm md:hidden">
          {menuItems.filter(item => !item.desktopOnly).map(item => renderMenuItem(item, () => setOpen(false)))}
        </nav>
      )}
    </header>
  )
}
