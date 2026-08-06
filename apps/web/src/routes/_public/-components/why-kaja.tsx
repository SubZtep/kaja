import { LandingSection, LandingSectionTitle } from "../../../components/ui/LandingSection"
import { Section } from "../../../components/ui/Section"

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
    <LandingSection alt contentClassName="py-10 sm:py-16">
      <LandingSectionTitle title="Why Kaja" meta="built with Bun + TypeScript" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(f => (
          <Section key={f.title}>
            <div className="mb-3.5 flex size-8 items-center justify-center rounded-md border border-neon/25 bg-neon/15 font-mono text-base text-neon">
              {f.glyph}
            </div>
            <div className="mb-1.5 font-semibold text-fg text-[15px]">{f.title}</div>
            <div className="text-[13.5px] text-muted">{f.desc}</div>
          </Section>
        ))}
      </div>
    </LandingSection>
  )
}
