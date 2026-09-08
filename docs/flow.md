---
layout: page
title: Flow
nav_order: 6
---

# Flow

One agent core, several front doors. Terminal, Telegram, and the website widget all drive the same
loop, personas, and tools — what differs is where the loop runs and which tools it's allowed.

```mermaid
---
config:
  look: handDrawn
  theme: neo-dark
---
flowchart TD
    subgraph Inputs["📥 Front doors"]
        Term["💻 Terminal (kaja)"]
        Tele["✈️ Telegram (kaja telegram)"]
        Widg["🌐 Website widget"]
        Voice["🎙️ Mic + speaker"]
    end
    Voice -.-> Term
    Term --> Session
    Tele --> Session
    Widg --> Session
    Config["⚙️ settings.toml + models.toml\n+ services.toml + mcp.toml"] --> Core

    Session["🔗 Session"] --> Core
    Core["🧠 Agent core (@kaja/nasi)"] --> Agent

    subgraph Persona["🎭 Persona"]
        Agent["Agent\ncurrent persona + config"] --> Route{"Persona fits?"}
        Route -->|"'when' matches"| Switch["Auto-switch persona"]
        Route -->|"no match"| Stay["Stay on persona"]
        Switch --> Prompt
        Stay --> Prompt
        Prompt["Compose system prompt\nrules + personality + memory\n+ location + language"]
    end

    Prompt --> CallLLM

    subgraph LLMLoop["🔁 LLM loop"]
        CallLLM["✨ Call LLM"] --> Decide{"Needs a tool?"}
        Decide -->|yes| RunTool["🛠️ Run tool\nweb search, files, memory,\ndataset_info, MCP, plugins"]
        RunTool -->|"shell command"| Confirm["✅ Approve / decline"]
        Confirm -.-> RunTool
        RunTool -.->|"result"| CallLLM
        Decide -->|"question"| Ask["❓ ask_user"]
        Ask -.->|"answer"| CallLLM
        Decide -->|"final answer"| Reply["💬 Reply to user"]
    end

    Reply --> DB
    RunTool --> DB
    DB[("🗄️ SQLite (local)\nPostgres (hosted)")]
    DB -.->|"notes, dataset answers,\nresumed session"| Core

    classDef inputs fill:#21262d,stroke:#8b949e,color:#e6edf3
    classDef persona fill:#161b22,stroke:#58a6ff,color:#e6edf3
    classDef loop fill:#0d1117,stroke:#1f6feb,color:#e6edf3
    classDef store fill:#161b22,stroke:#3fb950,color:#e6edf3
    class Term,Tele,Widg,Voice inputs
    class Agent,Route,Switch,Stay,Prompt persona
    class CallLLM,Decide,RunTool,Confirm,Ask,Reply loop
    class DB,Config,Session store
```

## Where the loop runs

| Front door | Loop runs | Store | Local tools |
|---|---|---|---|
| `kaja --local` | your machine | SQLite | ✓ shell, files, MCP, plugins |
| `kaja` (hosted) | the API | Postgres | ✗ |
| `kaja telegram` | your machine | SQLite | ✓ |
| Website [widget](/widget) | the API | Postgres | ✗ |

## Handoffs

Two tools stop the loop and hand control back to whoever is driving:

- **`ask_user`** — the agent needs a clarification. Your next message becomes the tool result, not
  a new turn.
- **`run_command`** — the agent wants to run a shell command. It waits for approval; in the
  terminal that's the `/` picker, on Telegram an inline keyboard. Local mode only.

A third, **`switch_persona`**, is intercepted mid-loop and swaps the persona (and its pinned model)
without stopping.

---

Next:

[Personas](/personas){: .btn .btn-green .fs-5 }
