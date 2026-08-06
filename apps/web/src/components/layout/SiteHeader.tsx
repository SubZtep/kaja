import { Menu, X } from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { BrandMark } from "./BrandMark"
import { ContentWidth } from "./ContentWidth"

export function SiteHeader({
  brandTo = "/",
  desktopNav,
  mobileNav
}: Readonly<{
  brandTo?: string
  desktopNav: ReactNode
  mobileNav: (close: () => void) => ReactNode
}>) {
  const [open, setOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const close = () => setOpen(false)

  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[role="alertdialog"], [role="dialog"]')) return
      if (headerRef.current && !headerRef.current.contains(target)) close()
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
      <ContentWidth className="flex items-center justify-between py-3 sm:py-4.5">
        <BrandMark to={brandTo} className="text-lg" />

        <nav className="hidden items-center gap-7 text-muted text-sm md:flex">{desktopNav}</nav>

        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="flex items-center justify-center rounded-md border border-border bg-surface p-2 text-fg md:hidden"
        >
          {open ? <X size={18} /> : <Menu size={18} />}
        </button>
      </ContentWidth>

      {open ? (
        <nav className="border-border border-t bg-bg text-muted text-sm md:hidden">
          <ContentWidth className="flex flex-col gap-4 py-3 sm:py-5">{mobileNav(close)}</ContentWidth>
        </nav>
      ) : null}
    </header>
  )
}
