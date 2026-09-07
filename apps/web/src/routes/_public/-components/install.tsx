import { useEffect, useState } from "react"
import { LandingSection, LandingSectionTitle } from "../../../components/ui/LandingSection"
import { Section } from "../../../components/ui/Section"
import { getInstallCmd } from "../../../lib/vars"
import { m } from "../../../paraglide/messages.js"

export function Install() {
  const [installCmd, setInstallCmd] = useState("curl -fsSL https://kaja.io/install.sh | bash")

  useEffect(() => {
    setInstallCmd(getInstallCmd())
  }, [])

  return (
    <LandingSection>
      <LandingSectionTitle title={m.install_title()} description={m.install_description()} />
      <p className="mb-4 text-md text-muted">{m.install_instruction()}</p>
      <div className="flex gap-4 flex-col md:flex-row">
        <Section bordered="sm-up">
          <p>{m.install_mac_linux_label()}</p>
          <code className="block font-mono text-fg text-[13.5px]">{installCmd}</code>
        </Section>
        <Section bordered="sm-up">
          <p>{m.install_windows_label()}</p>
          <code className="block font-mono text-fg text-[13.5px]">irm https://kaja.io/install.ps1 | iex</code>
        </Section>
      </div>

      <p className="mt-3 text-muted text-sm">
        {m.install_binary_prefix()}{" "}
        <a href="https://github.com/SubZtep/kaja/releases" target="_blank" rel="noopener" className="underline">
          {m.install_binary_link()}
        </a>{" "}
        {m.install_binary_suffix()}
      </p>
    </LandingSection>
  )
}
