import { useLoaderData } from "@tanstack/react-router"
import { FolderCode } from "lucide-react"
import { useEffect, useState } from "react"
import { ContentWidth } from "../../../components/layout/ContentWidth"
import { getInstallCmd } from "../../../lib/vars"
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
    script.src = `${apiUrl}/widget/widget.js`
    script.dataset.kajaKey = chatWidgetKey
    script.dataset.kajaBaseUrl = apiUrl
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
          <span className="size-1.5 rounded-full bg-ice" /> OSS &middot; MIT &middot; WIP
        </div>

        <h1 className="order-2 mb-8 font-extrabold text-balance text-fg text-[36px] leading-10 md:leading-16 tracking-[-0.02em] md:order-0 md:col-span-2 md:mb-8 md:text-[52px]">
          <q className="italic">Your terminal should talk by asking — never by guessing</q>
          <span className="ml-4 font-semibold text-gray-50 text-[32px] md:text-[44px] whitespace-nowrap">
            ― MiniMax M3
          </span>
        </h1>

        <div className="order-1 md:order-0 md:col-start-2 md:row-start-3 md:self-start">
          <BarkochbaGame />
        </div>

        <div className="order-3 md:order-0 md:col-start-1">
          <p className="mb-4 max-w-115 text-lg text-muted">
            <span className="font-bold text-gray-300">Kaja</span> is an open-source <strong>agentic harness</strong>.
            Based on your input, keep running an LLM with its findings again and again until the appropriate outcome
            (🙏).
          </p>
          <p className="mb-8 max-w-115 text-lg text-muted">
            It’s a <strong>state machine</strong>, driven by skilled AI models for various tasks (including image
            generation and speech), with local and online tools.
          </p>
          <div className="mb-7 sm:flex flex-wrap gap-3 hidden">
            <a
              href="https://github.com/SubZtep/kaja"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 rounded-md border border-green-600 bg-green-700 px-5 py-2.5 font-semibold text-sm text-white"
            >
              <FolderCode fill="white" size={12} />
              Source code on GitHub
            </a>
            <a
              href="https://docs.kaja.io"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-5 py-2.5 font-medium text-fg text-sm"
            >
              Read the docs
            </a>
          </div>
          <div className="flex max-w-116 items-center gap-2.5 rounded-md border border-border bg-surface-2 px-3.5 py-2.5">
            <code className="flex-1 overflow-x-hidden whitespace-nowrap font-mono text-fg text-sm">{installCmd}</code>
            <button
              type="button"
              onClick={copyInstall}
              className="shrink-0 cursor-pointer rounded border border-border bg-surface px-2.5 py-1.5 font-mono text-muted text-xs"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      </ContentWidth>
    </section>
  )
}
