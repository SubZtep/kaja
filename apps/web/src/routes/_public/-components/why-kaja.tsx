import { Bot, Drama, Hammer, MicAudioLines, Shapes, Smartphone } from "lucide-react"
import { LandingSection, LandingSectionTitle } from "../../../components/ui/LandingSection"
import { Section } from "../../../components/ui/Section"
import { m } from "../../../paraglide/messages.js"

// Read via a function (not a module-scope constant) so labels re-evaluate per render —
// `m.*()` calls captured at module load can go stale across the SSR/hydration boundary.
const getFeatures = () => [
  {
    id: "models",
    glyph: <Bot strokeWidth={1} />,
    title: m.why_kaja_feature_models_title(),
    desc: m.why_kaja_feature_models_desc()
  },
  {
    id: "voice",
    glyph: <MicAudioLines strokeWidth={1} />,
    title: m.why_kaja_feature_voice_title(),
    desc: m.why_kaja_feature_voice_desc()
  },
  {
    id: "widgets",
    glyph: <Shapes strokeWidth={1} />,
    title: m.why_kaja_feature_widgets_title(),
    desc: m.why_kaja_feature_widgets_desc()
  },
  {
    id: "personas",
    glyph: <Drama strokeWidth={1} />,
    title: m.why_kaja_feature_personas_title(),
    desc: m.why_kaja_feature_personas_desc()
  },
  {
    id: "tools",
    glyph: <Hammer strokeWidth={1} />,
    title: m.why_kaja_feature_tools_title(),
    desc: m.why_kaja_feature_tools_desc()
  },
  {
    id: "telegram",
    glyph: <Smartphone strokeWidth={1} />,
    title: m.why_kaja_feature_telegram_title(),
    desc: m.why_kaja_feature_telegram_desc()
  }
]

export function WhyKaja() {
  return (
    <LandingSection alt contentClassName="py-10 sm:py-16">
      <LandingSectionTitle title={m.why_kaja_title()} meta={m.why_kaja_meta()} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {getFeatures().map(f => (
          <Section key={f.id} bordered="sm-up" className="bg-transparent">
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
