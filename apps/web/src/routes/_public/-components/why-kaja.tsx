const FEATURES = [
  {
    glyph: "~/",
    title: "Local or cloud models",
    desc: "Any OpenAI-compatible API — Ollama, Fireworks, MiniMax M3, and more."
  },
  { glyph: "♪", title: "Voice in, voice out", desc: "Mic dictation and TTS via speaches, toggle with Ctrl+T." },
  { glyph: "@", title: "Personas", desc: "Switch the assistant's character without restarting." },
  { glyph: "()", title: "Tool use", desc: "Web search (Brave), location lookups, and more as config groups." },
  { glyph: "tg", title: "Also on Telegram", desc: "kaja telegram runs the same personas, tools and models as a bot." },
  { glyph: "{}", title: "Bun + TypeScript", desc: "Fast startup, single binary install, no runtime bloat." }
]

export function WhyKaja() {
  return (
    <section className="border-border border-y bg-surface-2">
      <div className="mx-auto max-w-280 px-6 py-16">
        <div className="mb-7 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 font-bold text-fg text-[26px]">Why Kaja</h2>
          <span className="font-mono text-[#6e7681] text-xs">built with Bun + TypeScript</span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(f => (
            <div key={f.title} className="rounded-xl border border-border bg-surface p-5.5">
              <div className="mb-3.5 flex size-8 items-center justify-center rounded-md border border-neon/25 bg-neon/15 font-mono text-neon text-base">
                {f.glyph}
              </div>
              <div className="mb-1.5 font-semibold text-fg text-[15px]">{f.title}</div>
              <div className="text-[13.5px] text-muted">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
