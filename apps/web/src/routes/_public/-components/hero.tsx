import { useLoaderData } from "@tanstack/react-router"
import { FolderCode } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "../../../components/form/primitives/Button"
import { ContentWidth } from "../../../components/layout/ContentWidth"
import { getInstallCmd } from "../../../lib/vars"
import { m } from "../../../paraglide/messages.js"
import { BarkochbaGame } from "./barkochba-game"

export function Hero() {
  const { apiUrl, chatWidgetKey } = useLoaderData({ from: "__root__" })
  const [copied, setCopied] = useState(false)
  const [installCmd, setInstallCmd] = useState("curl -fsSL https://kaja.io/install.sh | bash")

  useEffect(() => {
    setInstallCmd(getInstallCmd())
  }, [])

  // Embeds the standalone chat widget bubble under a separate account's key, alongside the
  // barkochba hero card above — demonstrates two independent widget instances on the same page.
  useEffect(() => {
    if (!chatWidgetKey) return
    const script = document.createElement("script")
    script.async = true
    script.src = `${apiUrl}/widget/${chatWidgetKey}.js`
    document.body.appendChild(script)
    return () => {
      script.remove()
    }
  }, [apiUrl, chatWidgetKey])

  const copyInstall = () => {
    navigator.clipboard?.writeText(installCmd)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute -top-45 left-1/2 h-125 w-225 -translate-x-1/2"
        style={{
          background:
            "radial-gradient(closest-side,color-mix(in srgb, var(--color-neon) 20%, transparent),transparent 70%)"
        }}
      />
      <ContentWidth className="relative flex flex-col gap-14 py-8 md:grid md:grid-cols-[1.1fr_1fr] md:gap-x-14 md:pt-24 md:pb-10">
        <div className="order-2 hidden mb-6 w-fit md:order-0 md:col-start-1 md:inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 font-mono text-muted text-xs">
          <span className="size-1.5 rounded-full bg-ice" /> {m.hero_badge()}
        </div>

        <h1
          className="order-2 mb-8 font-extrabold text-balance text-fg opacity-80 text-[36px] leading-10 md:leading-16 tracking-[-0.02em] md:order-0 md:col-span-2 md:mb-8 md:text-[52px]"
          style={{ textShadow: "0 0 8px rgba(120, 119, 198, 0.18)" }}
        >
          <q className="italic">{m.hero_quote()}</q>
          <span className="ml-4 font-semibold text-gray-50 text-[32px] md:text-[44px] whitespace-nowrap">
            {m.hero_quote_attribution()}
          </span>
        </h1>

        <div className="order-1 md:order-0 md:col-start-2 md:row-start-3 md:self-start">
          <BarkochbaGame />
        </div>

        <div className="order-3 md:order-0 md:col-start-1">
          <p className="mb-4 text-lg text-muted">{m.hero_paragraph_1()}</p>
          <p className="mb-8 text-lg text-muted">{m.hero_paragraph_2()}</p>
          <div className="mb-7 sm:flex flex-wrap gap-3 hidden w-full">
            <Button
              variant="primary"
              className="flex-1 gap-2 rounded-md! px-5! text-sm transition-colors duration-200 ease-in-out"
              render={
                <a
                  href="https://github.com/SubZtep/kaja"
                  target="_blank"
                  rel="noopener"
                  aria-label={m.hero_cta_source()}
                />
              }
            >
              <FolderCode size={21} className="pb-0.5" />
              {m.hero_cta_source()}
            </Button>
            <Button
              variant="secondary"
              className="flex-1 gap-2 rounded-md! px-5! text-sm transition-colors duration-150 ease-in-out"
              render={<a href="https://docs.kaja.io" target="_blank" rel="noopener" aria-label={m.hero_cta_docs()} />}
            >
              {m.hero_cta_docs()}
            </Button>
          </div>
          <div className="flex items-center gap-2.5 rounded-md border border-border bg-surface-2 px-3.5 py-2.5">
            <code className="flex-1 overflow-x-hidden whitespace-nowrap font-mono text-fg text-sm">{installCmd}</code>
            <button
              type="button"
              onClick={copyInstall}
              className="shrink-0 cursor-pointer rounded border border-border bg-surface px-2.5 py-1.5 font-mono text-muted text-xs"
            >
              {copied ? m.hero_copy_copied() : m.hero_copy_copy()}
            </button>
          </div>
        </div>
      </ContentWidth>
    </section>
  )
}
