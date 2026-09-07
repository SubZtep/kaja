import { Menu, X } from "lucide-react"
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react"
import { m } from "../../paraglide/messages.js"
import { LanguageSelect } from "../ui/LanguageSelect"
import { BrandMark } from "./BrandMark"
import { ContentWidth } from "./ContentWidth"

/** Lets an interactive element inside `mobileNav` (a link, the sign-out button) close the mobile menu on click. */
const CloseMobileNavContext = createContext<(() => void) | null>(null)

export function useCloseMobileNav() {
  const close = useContext(CloseMobileNavContext)
  if (!close) throw new Error("useCloseMobileNav must be used within SiteHeader's mobileNav")
  return close
}

export function SiteHeader({
  brandTo = "/",
  desktopNav,
  mobileNav
}: Readonly<{
  brandTo?: string
  desktopNav: ReactNode
  mobileNav: ReactNode
}>) {
  const [open, setOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[role="alertdialog"], [role="dialog"], [role="listbox"]')) return
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
        <BrandMark to={brandTo} monster className="text-lg" />

        <nav className="hidden items-center gap-7 text-muted text-sm md:flex">
          {desktopNav}
          <LanguageSelect />
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            aria-label={open ? m.menu_close() : m.menu_open()}
            aria-expanded={open}
            className="flex items-center justify-center rounded-md border border-border bg-surface p-2 text-fg"
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </ContentWidth>

      {open ? (
        <nav className="border-border border-t bg-bg text-muted text-sm md:hidden">
          <ContentWidth className="flex flex-col gap-4 py-3 sm:py-5">
            <CloseMobileNavContext.Provider value={close}>{mobileNav}</CloseMobileNavContext.Provider>
            <LanguageSelect />
          </ContentWidth>
        </nav>
      ) : null}
    </header>
  )
}
