import { useEffect, useState } from "react"
import { getInstallCmd } from "../../../../lib/vars"

export function Install() {
  const [installCmd, setInstallCmd] = useState("curl -fsSL https://kaja.io/setup.sh | bash")

  useEffect(() => {
    setInstallCmd(getInstallCmd())
  }, [])

  return (
    <section>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "72px 24px" }}>
        <h2 style={{ fontSize: 26, fontWeight: 700, color: "#f0f6fc", margin: "0 0 8px" }}>Install</h2>
        <p style={{ fontSize: 14.5, color: "#8b949e", margin: "0 0 28px" }}>
          Only tested on Linux. A setup wizard walks you through config on first launch (or anytime config is
          missing/invalid) &mdash; no separate step needed.
        </p>
        <div style={{ background: "#0d1117", border: "1px solid #30363d", borderRadius: 10, padding: "20px 22px" }}>
          <code className="font-mono" style={{ fontSize: 13.5, color: "#e6edf3", display: "block" }}>
            {installCmd}
          </code>
        </div>
        <p style={{ fontSize: 13, color: "#6e7681", margin: "12px 0 0" }}>
          Prefer a plain binary?{" "}
          <a href="https://github.com/SubZtep/kaja/releases" target="_blank" rel="noopener">
            Grab one from Releases
          </a>{" "}
          &mdash; Linux, macOS, and Windows, x64 and arm64.
        </p>
      </div>
    </section>
  )
}
