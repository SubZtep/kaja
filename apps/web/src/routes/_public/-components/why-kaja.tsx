import { Bot, Drama, Hammer, MicAudioLines, Shapes, Smartphone } from "lucide-react"
import { LandingSection, LandingSectionTitle } from "../../../components/ui/LandingSection"
import { Section } from "../../../components/ui/Section"

const FEATURES = [
  {
    glyph: <Bot strokeWidth={1} />,
    title: "Local or cloud models",
    desc: "OpenAI compatible — Ollama, Fireworks, Ministral, MiniMax M3, and more"
  },
  {
    glyph: <MicAudioLines strokeWidth={1} />,
    title: "Voice in, voice out",
    desc: "Mic dictation and TTS via speaches, toggle with Ctrl+T"
  },
  {
    glyph: <Shapes strokeWidth={1} />,
    title: "Widgets",
    desc: "Embeddable UI components for seamless AI integration"
  },
  {
    glyph: <Drama strokeWidth={1} />,
    title: "Personas",
    desc: "The assistant switches its behaviours and tweaks model settings based on the context"
  },
  {
    glyph: <Hammer strokeWidth={1} />,
    title: "Tool use",
    desc: "Brave web search, location lookups, and more as config groups"
  },
  {
    glyph: <Smartphone strokeWidth={1} />,
    title: "Also on Telegram",
    desc: "Kaja telegram runs the same personas, tools and models as a bot"
  }
]

export function WhyKaja() {
  return (
    <LandingSection alt contentClassName="py-10 sm:py-16">
      <LandingSectionTitle title="Why Kaja" meta="Work in Progress (WIP)" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(f => (
          <Section key={f.title} className="border-0 bg-transparent p-0 sm:border sm:px-6 sm:py-6">
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
