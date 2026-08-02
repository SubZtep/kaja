import { Link } from "@tanstack/react-router"

export function Header() {
  return (
    <header className="sticky top-0 z-10 border-border border-b bg-bg/95 backdrop-blur-sm">
      <div className="mx-auto flex max-w-280 items-center justify-between px-6 py-4.5">
        <div className="flex items-center gap-2 font-mono font-bold text-lg text-fg">
          <Link to="/">
            <span className="text-neon">&gt;</span> kaja
          </Link>
        </div>
        <nav className="flex items-center gap-7 text-muted text-sm">
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
            ★ Star
          </a>
        </nav>
      </div>
    </header>
  )
}
