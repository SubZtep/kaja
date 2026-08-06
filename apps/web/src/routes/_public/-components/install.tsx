import { useEffect, useState } from "react"
import { getInstallCmd } from "../../../lib/vars"

export function Install() {
  const [installCmd, setInstallCmd] = useState("curl -fsSL https://kaja.io/setup.sh | bash")

  useEffect(() => {
    setInstallCmd(getInstallCmd())
  }, [])

  return (
    <section>
      <div className="mx-auto max-w-280 px-6 py-18">
        <h2 className="mb-2 font-bold text-fg text-[26px]">Install</h2>
        <p className="mb-7 text-[14.5px] text-muted">
          Only tested on Linux. A setup wizard walks you through config on first launch (or anytime config is
          missing/invalid) &mdash; no separate step needed.
        </p>
        <div className="rounded-xl border border-border bg-surface px-5.5 py-5">
          <code className="block font-mono text-fg text-[13.5px]">{installCmd}</code>
        </div>
        <p className="mt-3 text-[#6e7681] text-sm">
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
