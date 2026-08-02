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
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute top-[-180px] left-1/2 h-[500px] w-[900px] -translate-x-1/2"
        style={{
          background:
            "radial-gradient(closest-side,color-mix(in srgb, var(--color-neon) 20%, transparent),transparent 70%)"
        }}
      />
      <div className="relative mx-auto grid max-w-280 grid-cols-[1.1fr_1fr] items-center gap-14 px-6 pt-24 pb-10">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-1.5 font-mono text-muted text-xs">
            <span className="size-1.5 rounded-full bg-ice" /> open source &middot; MIT &middot; WIP
          </div>
          <h1 className="mb-5 font-extrabold text-fg text-[52px] leading-[1.08] tracking-[-0.02em]">
            Your terminal
            <br />
            can talk now.
          </h1>
          <p className="mb-8 max-w-115 text-lg text-muted">
            Kaja CLI is an open-source terminal chat assistant &mdash; personas, tool use, mic dictation, and
            text-to-speech, running on the model you choose.
          </p>
          <div className="mb-7 flex flex-wrap gap-3">
            <a
              href="https://github.com/SubZtep/kaja/stargazers"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-2 rounded-md border border-green-600 bg-green-700 px-5 py-2.5 font-semibold text-sm text-white"
            >
              ★ Star on GitHub
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
          <div className="flex max-w-105 items-center gap-2.5 rounded-md border border-border bg-surface-2 px-3.5 py-2.5">
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

        <div className="overflow-hidden rounded-xl border border-border bg-surface-2 shadow-[0_24px_60px_-20px_#000a]">
          <div className="flex items-center gap-2 border-border border-b bg-surface px-3.5 py-2.5">
            <span className="size-2.5 rounded-full bg-[#ff5f56]" />
            <span className="size-2.5 rounded-full bg-[#ffbd2e]" />
            <span className="size-2.5 rounded-full bg-[#27c93f]" />
            <span className="ml-1.5 font-mono text-muted text-xs">kaja</span>
          </div>
          <div className="min-h-65 p-5 font-mono text-[13.5px] leading-[1.9]">
            <div className="text-muted">
              $ <span className="text-fg">kaja</span>
            </div>
            <div>&gt; how can i watch one night in paris tonight in the uk?</div>
            <div className="text-muted">⋮ calling web_search &hellip;</div>
            <div className="text-ice">✓ found 2 relevant films</div>
            <div className="mt-2.5">
              There are actually <span className="text-neon">a couple of films</span> with a similar name. Just to check
              — are you referring to:
              <br />
              1. <strong>One Night in Paris (2021)</strong> – a French stand-up comedy special on Netflix featuring top
              French comics
              <br />
              2. &hellip;
            </div>
            <div className="mt-2.5 text-muted">
              *&nbsp;nevermind<span style={{ animation: "blink 1s step-end infinite" }}>█</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
