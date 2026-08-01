const PERSONAS = [
  { id: "default", label: "Helpful assistant", when: "no other persona clearly fits the conversation" },
  { id: "barkochba", label: "Barkochba guesser", when: "the user wants to play a guessing game / twenty questions" },
  {
    id: "care",
    label: "Self-care companion",
    when: "the user talks about their day, feelings, mood, or personal struggles"
  },
  {
    id: "onboarding",
    label: "Onboarding assistant",
    when: "a new user should be walked through the initial getting-to-know-you questions"
  }
]

export function Personas() {
  return (
    <section>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "72px 24px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 8,
            flexWrap: "wrap",
            gap: 8
          }}
        >
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#f0f6fc", margin: 0 }}>Personas</h2>
          <span className="font-mono" style={{ fontSize: 12, color: "#6e7681" }}>
            ~/.config/kaja/personas/*.toml
          </span>
        </div>
        <p style={{ fontSize: 14.5, color: "#8b949e", margin: "0 0 28px", maxWidth: 640 }}>
          Each persona is a{" "}
          <code
            className="font-mono"
            style={{ color: "#c9d1d9", background: "#161b22", padding: "2px 6px", borderRadius: 4 }}
          >
            .toml
          </code>{" "}
          file: a label, its system-prompt instructions, and an optional{" "}
          <code
            className="font-mono"
            style={{ color: "#c9d1d9", background: "#161b22", padding: "2px 6px", borderRadius: 4 }}
          >
            when
          </code>{" "}
          clause. Kaja reads the room and switches personas mid-conversation on its own &mdash; no command needed.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 16 }}>
          {PERSONAS.map(p => (
            <div
              key={p.id}
              style={{ padding: "20px 22px", background: "#161b22", border: "1px solid #21262d", borderRadius: 10 }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#e6edf3" }}>{p.label}</div>
                <span className="font-mono" style={{ fontSize: 11, color: "#6e7681" }}>
                  {p.id}.toml
                </span>
              </div>
              <div
                className="font-mono"
                style={{
                  fontSize: 12.5,
                  color: "#8b949e",
                  background: "#0d1117",
                  border: "1px solid #21262d",
                  borderRadius: 6,
                  padding: "10px 12px",
                  lineHeight: 1.6
                }}
              >
                when = <span style={{ color: "#a5d6ff" }}>"{p.when}"</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
