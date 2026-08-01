export function Footer() {
  return (
    <section style={{ borderTop: "1px solid #21262d" }}>
      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          padding: "56px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16
        }}
      >
        <div>
          <div className="font-mono" style={{ fontSize: 15, fontWeight: 700, color: "#e6edf3", marginBottom: 4 }}>
            &gt; kaja
          </div>
          <div style={{ fontSize: 13, color: "#6e7681" }}>
            MIT License &middot; built with Bun + TypeScript &middot;{" "}
            <a href="https://x.com/SubZtep" target="_blank" rel="noopener">
              SubZtep
            </a>
          </div>
        </div>
        <a
          href="https://github.com/SubZtep/kaja/stargazers"
          target="_blank"
          style={{
            fontSize: 13,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "#161b22",
            border: "1px solid #30363d",
            color: "#e6edf3",
            padding: "8px 16px",
            borderRadius: 6
          }}
          rel="noopener"
        >
          ★ Star on GitHub
        </a>
      </div>
    </section>
  )
}
