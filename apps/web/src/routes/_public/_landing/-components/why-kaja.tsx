const FEATURES = [
  {
    glyph: "~/",
    title: "Local or cloud models",
    desc: "Any OpenAI-compatible API — Ollama, Fireworks, MiniMax M3, and more."
  },
  { glyph: "♪", title: "Voice in, voice out", desc: "Mic dictation and TTS via speaches, toggle with Ctrl+T." },
  { glyph: "@", title: "Personas", desc: "Switch the assistant's character without restarting." },
  { glyph: "()", title: "Tool use", desc: "Web search (Brave), location lookups, and more as config groups." },
  { glyph: "tg", title: "Also on Telegram", desc: "kaja telegram runs the same personas, tools and models as a bot." },
  { glyph: "{}", title: "Bun + TypeScript", desc: "Fast startup, single binary install, no runtime bloat." }
]

export function WhyKaja() {
  return (
    <section style={{ background: "#0d1117", borderTop: "1px solid #21262d", borderBottom: "1px solid #21262d" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "64px 24px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 28,
            flexWrap: "wrap",
            gap: 8
          }}
        >
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#f0f6fc", margin: 0 }}>Why Kaja</h2>
          <span className="font-mono" style={{ fontSize: 12, color: "#6e7681" }}>
            built with Bun + TypeScript
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
          {FEATURES.map(f => (
            <div
              key={f.title}
              style={{ padding: 22, background: "#161b22", border: "1px solid #21262d", borderRadius: 10 }}
            >
              <div
                className="font-mono"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 7,
                  background: "#1f6feb22",
                  border: "1px solid #1f6feb44",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 15,
                  color: "#58a6ff",
                  marginBottom: 14
                }}
              >
                {f.glyph}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#e6edf3", marginBottom: 6 }}>{f.title}</div>
              <div style={{ fontSize: 13.5, color: "#8b949e" }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
