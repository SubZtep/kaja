import { Link } from "@tanstack/react-router"
import { Menu, Star, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

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
          <Link to="/architecture" className="hover:underline" activeProps={{ className: "overline" }}>
            Architecture
          </Link>
          <a href="https://docs.kaja.io" target="_blank" rel="noopener">
            Docs
          </a>
          <a href="https://github.com/SubZtep/kaja" target="_blank" rel="noopener">
            GitHub
          </a>
          {/* <Link to="/signin">
            Sign In
          </Link> */}
          {/* <Link to="/signup">
            Sign Up
          </Link> */}
          <a
            href="https://github.com/SubZtep/kaja/stargazers"
            target="_blank"
            className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3.5 py-1.5 font-medium text-fg"
            rel="noopener"
          >
            <Star fill="white" size={12} />
            Star
          </a>
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
          <Link
            to="/architecture"
            className="hover:underline"
            activeProps={{ className: "overline" }}
            onClick={() => setOpen(false)}
          >
            Architecture
          </Link>
          <a href="https://docs.kaja.io" target="_blank" rel="noopener">
            Docs
          </a>
          <a href="https://github.com/SubZtep/kaja" target="_blank" rel="noopener">
            GitHub
          </a>
          <a
            href="https://github.com/SubZtep/kaja/stargazers"
            target="_blank"
            className="flex w-fit items-center gap-1.5 rounded-md border border-border bg-surface px-3.5 py-1.5 font-medium text-fg"
            rel="noopener"
          >
            <Star fill="white" size={12} />
            Star
          </a>
        </nav>
      )}
    </header>
  )
}
