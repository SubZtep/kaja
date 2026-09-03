import { useEffect, useState } from "react"
import { LandingSection, LandingSectionTitle } from "../../../components/ui/LandingSection"
import { Section } from "../../../components/ui/Section"
import { getInstallCmd } from "../../../lib/vars"

export function Install() {
  const [installCmd, setInstallCmd] = useState("curl -fsSL https://kaja.io/install.sh | bash")

  useEffect(() => {
    setInstallCmd(getInstallCmd())
  }, [])

  return (
    <LandingSection>
      <LandingSectionTitle
        title="Install"
        description="Only tested on Linux. A setup wizard walks you through config on first launch (or anytime config is missing/invalid) &mdash; no separate step needed."
      />
      <p className="mb-4 text-md text-mist-500">Paste the appropriate command in your terminal, enter to install:</p>
      <div className="flex gap-4 flex-col md:flex-row">
        <Section>
          <p>On Mac/Linux:</p>
          <code className="block font-mono text-fg text-[13.5px]">{installCmd}</code>
        </Section>
        <Section>
          <p>On Windows:</p>
          <code className="block font-mono text-fg text-[13.5px]">irm https://kaja.io/install.ps1 | iex</code>
        </Section>
      </div>

      <p className="mt-3 text-[#6e7681] text-sm">
        Prefer a plain binary?{" "}
        <a href="https://github.com/SubZtep/kaja/releases" target="_blank" rel="noopener">
          Grab one from Releases
        </a>{" "}
        &mdash; Linux, macOS, and Windows, x64 and arm64.
      </p>
    </LandingSection>
  )
}
