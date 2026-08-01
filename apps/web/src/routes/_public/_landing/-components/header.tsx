import { Link } from "@tanstack/react-router"

export function Header() {
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "#0a0d12ee",
        backdropFilter: "blur(8px)",
        borderBottom: "1px solid #21262d"
      }}
    >
      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          padding: "18px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 18,
            fontWeight: 700,
            color: "#e6edf3"
          }}
          className="font-mono"
        >
          <Link to="/">
            <span style={{ color: "#58a6ff" }}>&gt;</span> kaja
          </Link>
        </div>
        <nav style={{ display: "flex", alignItems: "center", gap: 28, fontSize: 14 }}>
          <Link
            to="/architecture"
            className="hover:underline"
            activeProps={{ className: "overline" }}
            style={{ color: "#c9d1d9" }}
          >
            Architecture
          </Link>
          <a href="https://docs.kaja.io" target="_blank" style={{ color: "#c9d1d9" }} rel="noopener">
            Docs
          </a>
          <a href="https://github.com/SubZtep/kaja" target="_blank" style={{ color: "#c9d1d9" }} rel="noopener">
            GitHub
          </a>
          {/* <Link to="/signin" style={{ color: "#c9d1d9" }}>
            Sign In
          </Link> */}
          {/* <Link to="/signup" style={{ color: "#c9d1d9" }}>
            Sign Up
          </Link> */}
          <a
            href="https://github.com/SubZtep/kaja/stargazers"
            target="_blank"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "#161b22",
              border: "1px solid #30363d",
              color: "#e6edf3",
              padding: "7px 14px",
              borderRadius: 6,
              fontWeight: 500
            }}
            rel="noopener"
          >
            ★ Star
          </a>
        </nav>
      </div>
    </header>
  )
}
