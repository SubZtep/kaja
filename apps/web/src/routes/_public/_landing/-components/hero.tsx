import { useEffect, useState } from "react"
import { getInstallCmd } from "../../../../lib/vars"

export function Hero() {
  const [copied, setCopied] = useState(false)
  const [installCmd, setInstallCmd] = useState("curl -fsSL https://kaja.io/setup.sh | bash")

  useEffect(() => {
    setInstallCmd(getInstallCmd())
  }, [])

  const copyInstall = () => {
    navigator.clipboard?.writeText(installCmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <section style={{ position: "relative", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          top: -180,
          left: "50%",
          transform: "translateX(-50%)",
          width: 900,
          height: 500,
          background: "radial-gradient(closest-side,#1f6feb33,transparent 70%)",
          pointerEvents: "none"
        }}
      />
      <div
        style={{
          maxWidth: 1120,
          margin: "0 auto",
          padding: "96px 24px 40px",
          position: "relative",
          display: "grid",
          gridTemplateColumns: "1.1fr 1fr",
          gap: 56,
          alignItems: "center"
        }}
      >
        <div>
          <div
            className="font-mono"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "#161b22",
              border: "1px solid #30363d",
              borderRadius: 20,
              padding: "5px 14px",
              fontSize: 12,
              color: "#8b949e",
              marginBottom: 24
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3fb950" }} /> open source &middot;
            MIT &middot; WIP
          </div>
          <h1
            style={{
              fontSize: 52,
              lineHeight: 1.08,
              letterSpacing: "-0.02em",
              fontWeight: 800,
              color: "#f0f6fc",
              margin: "0 0 20px"
            }}
          >
            Your terminal
            <br />
            can talk now.
          </h1>
          <p style={{ fontSize: 18, color: "#8b949e", maxWidth: 460, margin: "0 0 32px" }}>
            Kaja CLI is an open-source terminal chat assistant &mdash; personas, tool use, mic dictation, and
            text-to-speech, running on the model you choose.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
            <a
              href="https://github.com/SubZtep/kaja/stargazers"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "#238636",
                border: "1px solid #2ea043",
                color: "#fff",
                padding: "11px 20px",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600
              }}
            >
              ★ Star on GitHub
            </a>
            <a
              href="https://docs.kaja.io"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "#161b22",
                border: "1px solid #30363d",
                color: "#e6edf3",
                padding: "11px 20px",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 500
              }}
            >
              Read the docs
            </a>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "#0d1117",
              border: "1px solid #21262d",
              borderRadius: 6,
              padding: "10px 14px",
              maxWidth: 420
            }}
          >
            <code
              className="font-mono overflow-x-hidden"
              style={{
                fontSize: 13,
                color: "#e6edf3",
                flex: 1,
                whiteSpace: "nowrap"
              }}
            >
              {installCmd}
            </code>
            <button
              type="button"
              onClick={copyInstall}
              className="font-mono"
              style={{
                flexShrink: 0,
                background: "#21262d",
                border: "1px solid #30363d",
                color: "#c9d1d9",
                padding: "5px 10px",
                borderRadius: 5,
                fontSize: 11,
                cursor: "pointer"
              }}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        <div
          style={{
            background: "#0d1117",
            border: "1px solid #30363d",
            borderRadius: 10,
            overflow: "hidden",
            boxShadow: "0 24px 60px -20px #000a"
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "11px 14px",
              borderBottom: "1px solid #21262d",
              background: "#161b22"
            }}
          >
            <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#ff5f56" }} />
            <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#ffbd2e" }} />
            <span style={{ width: 11, height: 11, borderRadius: "50%", background: "#27c93f" }} />
            <span className="font-mono" style={{ fontSize: 12, color: "#8b949e", marginLeft: 6 }}>
              kaja
            </span>
          </div>
          <div className="font-mono" style={{ padding: "20px 18px", fontSize: 13.5, lineHeight: 1.9, minHeight: 260 }}>
            <div style={{ color: "#8b949e" }}>
              $ <span style={{ color: "#e6edf3" }}>kaja</span>
            </div>
            <div style={{ color: "#c9d1d9" }}>&gt; explain the auth flow in this repo</div>
            <div style={{ color: "#8b949e" }}>⋮ reading project &hellip;</div>
            <div style={{ color: "#8b949e" }}>⋮ calling web_search &hellip;</div>
            <div style={{ color: "#3fb950" }}>✓ found 3 relevant files</div>
            <div style={{ color: "#c9d1d9", marginTop: 10 }}>
              Auth runs through <span style={{ color: "#58a6ff" }}>lib/session.ts</span> &mdash;
              <br />
              tokens are verified on every request&hellip;
            </div>
            <div style={{ color: "#8b949e", marginTop: 10 }}>
              *&nbsp; <span style={{ animation: "blink 1s step-end infinite" }}>█</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
