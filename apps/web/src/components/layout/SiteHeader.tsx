import { Dialog } from "@base-ui/react/dialog"
import { Menu, X } from "lucide-react"
import { createContext, type ReactNode, useCallback, useContext, useState } from "react"
import { m } from "../../paraglide/messages.js"
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
  const close = useCallback(() => setOpen(false), [])

  return (
    <header className="sticky top-0 z-50 border-border border-b bg-bg/95 backdrop-blur-sm">
      <ContentWidth className="flex items-center justify-between py-3 sm:py-4.5">
        <BrandMark to={brandTo} monster className="text-lg" />

        <nav className="hidden items-center gap-3 text-muted text-sm lg:flex">{desktopNav}</nav>

        <Dialog.Root open={open} onOpenChange={setOpen}>
          <Dialog.Trigger
            className="flex items-center justify-center border border-fg bg-ice p-2 text-bg lg:hidden"
            style={{ clipPath: "polygon(6% 0%, 100% 8%, 94% 100%, 0% 88%)" }}
            aria-label={open ? m.menu_close() : m.menu_open()}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 z-40 min-h-dvh bg-black/70 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-[-webkit-touch-callout:none]:absolute" />
            <Dialog.Popup
              className="fixed inset-x-4 top-20 z-50 max-h-[min(70dvh,28rem)] overflow-y-auto bg-surface p-5 text-fg shadow-[6px_8px_0_var(--color-border)] outline-none transition-all duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 sm:inset-x-6"
              style={{
                clipPath: "polygon(1.2% 1%, 98.5% 0.4%, 100% 4%, 99% 97%, 96% 100%, 2% 98.5%, 0% 94%, 0.5% 3%)"
              }}
            >
              <Dialog.Title className="sr-only">{m.menu_open()}</Dialog.Title>
              <nav className="flex flex-col items-start gap-3 text-sm">
                <CloseMobileNavContext.Provider value={close}>{mobileNav}</CloseMobileNavContext.Provider>
              </nav>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      </ContentWidth>
    </header>
  )
}
