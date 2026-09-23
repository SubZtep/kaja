import { useEffect, useState } from "react"
import { ContentWidth } from "../../../components/layout/ContentWidth"
import { getInstallCmd } from "../../../lib/vars"
import { m } from "../../../paraglide/messages.js"
import { Sticker } from "./sticker"

export function Install() {
  const [installCmd, setInstallCmd] = useState("curl -fsSL https://kaja.io/install.sh | bash")

  useEffect(() => {
    setInstallCmd(getInstallCmd())
  }, [])

  return (
    <section>
      <ContentWidth className="py-10 sm:py-16">
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <h2 className="m-0 font-display font-extrabold text-fg text-3xl md:text-4xl">{m.install_title()}</h2>
          <Sticker rotate={8} className="text-[10px]">
            {m.install_linux_note()}
          </Sticker>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="crt-frame px-4 py-5">
            <p className="m-0 mb-2 font-stamp text-[11px] text-ice uppercase">{m.install_mac_linux_label()}</p>
            <code className="block overflow-x-auto whitespace-nowrap font-crt text-neon text-sm">{installCmd}</code>
          </div>
          <div className="crt-frame px-4 py-5">
            <p className="m-0 mb-2 font-stamp text-[11px] text-ice uppercase">{m.install_windows_label()}</p>
            <code className="block overflow-x-auto whitespace-nowrap font-crt text-neon text-sm">
              irm https://kaja.io/install.ps1 | iex
            </code>
          </div>
        </div>

        <p className="mt-6 font-crt text-muted text-sm">
          {m.install_binary_prefix()}{" "}
          <a
            href="https://github.com/SubZtep/kaja/releases"
            target="_blank"
            rel="noopener"
            className="text-neon underline underline-offset-2"
          >
            {m.install_binary_link()}
          </a>{" "}
          {m.install_binary_suffix()}
        </p>
        <a
          href="https://github.com/SubZtep/kaja"
          target="_blank"
          rel="noopener"
          className="mt-2 inline-block font-crt text-muted text-sm hover:text-neon"
        >
          {m.hero_cta_source()}
        </a>
      </ContentWidth>
    </section>
  )
}
