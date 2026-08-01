const ITEMS = [
  {
    title: "config.json",
    desc: (
      <>
        The only required group is{" "}
        <code className="font-mono" style={{ color: "#c9d1d9" }}>
          llm
        </code>
        . Add{" "}
        <code className="font-mono" style={{ color: "#c9d1d9" }}>
          stt
        </code>
        ,{" "}
        <code className="font-mono" style={{ color: "#c9d1d9" }}>
          tts
        </code>
        ,{" "}
        <code className="font-mono" style={{ color: "#c9d1d9" }}>
          location
        </code>
        ,{" "}
        <code className="font-mono" style={{ color: "#c9d1d9" }}>
          webSearch
        </code>
        , or{" "}
        <code className="font-mono" style={{ color: "#c9d1d9" }}>
          telegram
        </code>{" "}
        groups to turn features on; leave one out and it's simply unavailable.
      </>
    )
  },
  {
    title: "models.toml",
    desc: (
      <>
        Every model your provider offers, so you can swap{" "}
        <code className="font-mono" style={{ color: "#c9d1d9" }}>
          llm.model
        </code>{" "}
        without re-entering credentials. The wizard writes a template matching your chosen provider on first run.
      </>
    )
  },
  {
    title: "mcp.toml",
    desc: "Model Context Protocol servers the agent can call — a standard way to plug in extra tools without changing Kaja itself."
  },
  {
    title: "personas/ & datasets/",
    desc: (
      <>
        One{" "}
        <code className="font-mono" style={{ color: "#c9d1d9" }}>
          .toml
        </code>{" "}
        per persona, one{" "}
        <code className="font-mono" style={{ color: "#c9d1d9" }}>
          .json
        </code>{" "}
        per dataset topic &mdash; the fields a persona should try to collect in conversation.
      </>
    )
  }
]

export function Configuration() {
  return (
    <section style={{ background: "#0d1117", borderTop: "1px solid #21262d", borderBottom: "1px solid #21262d" }}>
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
          <h2 style={{ fontSize: 26, fontWeight: 700, color: "#f0f6fc", margin: 0 }}>Configuration</h2>
          <span className="font-mono" style={{ fontSize: 12, color: "#6e7681" }}>
            ~/.config/kaja/
          </span>
        </div>
        <p style={{ fontSize: 14.5, color: "#8b949e", margin: "0 0 28px", maxWidth: 640 }}>
          Everything lives in plain files. Edit them by hand, or let{" "}
          <code
            className="font-mono"
            style={{ color: "#c9d1d9", background: "#161b22", padding: "2px 6px", borderRadius: 4 }}
          >
            kaja --wizard
          </code>{" "}
          write them for you.
        </p>
        <div
          style={{
            background: "#0d1117",
            border: "1px solid #30363d",
            borderRadius: 10,
            padding: "20px 22px",
            marginBottom: 20
          }}
        >
          <code className="font-mono whitespace-pre block" style={{ fontSize: 13, color: "#e6edf3" }}>
            {
              "~/.config/kaja/\n├─ config.json     one required group (llm), rest optional\n├─ models.toml     model catalog per provider\n├─ mcp.toml        Model Context Protocol tool servers\n├─ personas/*.toml one behaviour per file\n└─ datasets/*.json custom fields for personas to collect"
            }
          </code>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 16 }}>
          {ITEMS.map(item => (
            <div
              key={item.title}
              style={{ padding: "18px 20px", background: "#161b22", border: "1px solid #21262d", borderRadius: 10 }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: "#e6edf3", marginBottom: 6 }}>{item.title}</div>
              <div style={{ fontSize: 13, color: "#8b949e" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
