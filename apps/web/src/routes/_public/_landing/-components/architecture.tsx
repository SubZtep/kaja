import { useEffect, useRef } from "react"

const mono = "'JetBrains Mono', monospace"

const DIAGRAM_DEF = `flowchart TD
    subgraph Inputs["📥 Inputs"]
        Term["💻 Terminal (kaja)"]
        Tele["✈️ Telegram (kaja telegram)"]
        Voice["🎙️ Mic + speaker"]
    end
    Voice -.-> Term
    Term --> Session
    Tele --> Session
    Config["⚙️ config.json + models.toml\n+ mcp.toml"] --> Core

    Session["🔗 Session"] --> Core
    Core["🧠 Agent core"] --> Agent

    subgraph Persona["🎭 Persona"]
        Agent["Agent\ncurrent persona + config"] --> Route{"Persona fits?"}
        Route -->|"'when' matches"| Switch["Auto-switch persona"]
        Route -->|"no match"| Stay["Stay on persona"]
        Switch --> Prompt
        Stay --> Prompt
        Prompt["Compose system prompt\nrules + personality\n+ knowledge + language"]
    end

    Prompt --> CallLLM

    subgraph LLMLoop["🔁 LLM loop"]
        CallLLM["✨ Call LLM\ncapable model"] --> Decide{"Needs a tool?"}
        Decide -->|yes| RunTool["🛠️ Run tool\nweb search, shell, memory,\ndataset_info, MCP servers"]
        RunTool -->|"shell command"| Confirm["✅ Approve / decline"]
        Confirm -.-> RunTool
        RunTool -.->|"result"| CallLLM
        Decide -->|"final answer"| Reply["💬 Reply to user"]
    end

    Reply --> DB
    RunTool --> DB
    DB[("🗄️ SQLite")]
    DB -.->|"notes, progress,\nresumed session"| Core

    classDef inputs fill:#21262d,stroke:#8b949e,color:#e6edf3
    classDef persona fill:#161b22,stroke:#58a6ff,color:#e6edf3
    classDef loop fill:#0d1117,stroke:#1f6feb,color:#e6edf3
    classDef store fill:#161b22,stroke:#3fb950,color:#e6edf3
    class Term,Tele,Voice inputs
    class Agent,Route,Switch,Stay,Prompt persona
    class CallLLM,Decide,RunTool,Confirm,Reply loop
    class DB,Config,Session store`

export function Architecture() {
  const diagramRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false

    async function render() {
      const { default: mermaid } = await import("mermaid")
      if (document.fonts) await document.fonts.ready
      if (cancelled || !diagramRef.current) return

      mermaid.initialize({
        startOnLoad: false,
        theme: "base",
        fontFamily: mono,
        themeVariables: {
          background: "#0d1117",
          primaryColor: "#161b22",
          primaryTextColor: "#e6edf3",
          primaryBorderColor: "#30363d",
          lineColor: "#58a6ff",
          clusterBkg: "#161b22",
          clusterBorder: "#30363d",
          edgeLabelBackground: "#0d1117",
          fontSize: "14px"
        }
      })
      const { svg } = await mermaid.render("archDiagramSvg", DIAGRAM_DEF)
      if (!cancelled && diagramRef.current) diagramRef.current.innerHTML = svg
    }

    render()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section style={{ background: "#0d1117", borderTop: "1px solid #21262d", borderBottom: "1px solid #21262d" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "72px 24px" }}>
        <h2 style={{ fontSize: 26, fontWeight: 700, color: "#f0f6fc", margin: "0 0 8px" }}>Architecture</h2>
        <p style={{ fontSize: 14.5, color: "#8b949e", margin: "0 0 32px", maxWidth: 640 }}>
          One agent core, two front doors. The terminal and Telegram both drive the same persona, tools, and model
          config.
        </p>
        <div
          style={{
            background: "#0d1117",
            border: "1px solid #21262d",
            borderRadius: 10,
            padding: 32,
            overflowX: "auto"
          }}
        >
          <div ref={diagramRef} style={{ width: "100%", minWidth: 700, maxWidth: 920, margin: "0 auto" }} />
        </div>
      </div>
    </section>
  )
}
