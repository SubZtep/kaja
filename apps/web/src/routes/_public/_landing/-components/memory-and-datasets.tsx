export function MemoryAndDatasets() {
  return (
    <section style={{ background: "#0d1117", borderTop: "1px solid #21262d", borderBottom: "1px solid #21262d" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "72px 24px" }}>
        <h2 style={{ fontSize: 26, fontWeight: 700, color: "#f0f6fc", margin: "0 0 8px" }}>Memory &amp; datasets</h2>
        <p style={{ fontSize: 14.5, color: "#8b949e", margin: "0 0 28px", maxWidth: 640 }}>
          Two ways Kaja carries context across a conversation &mdash; and across sessions.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 10, padding: 22 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#e6edf3", marginBottom: 8 }}>Persistent memory</div>
            <p style={{ fontSize: 13.5, color: "#8b949e", margin: 0 }}>
              Kaja remembers durable facts about you or your project across sessions, and quietly recalls them later.
              The important ones are marked sticky, so they ride along in every conversation without you having to
              repeat yourself.
            </p>
          </div>
          <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 10, padding: 22 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#e6edf3", marginBottom: 8 }}>Dataset collection</div>
            <p style={{ fontSize: 13.5, color: "#8b949e", margin: 0 }}>
              Some personas gently gather a set of facts over the course of a conversation &mdash; the onboarding
              assistant, for example, gets to know a new user one question at a time.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
