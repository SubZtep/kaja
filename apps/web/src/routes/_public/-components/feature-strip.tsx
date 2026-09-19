import { Bot, Drama, MicAudioLines, Send } from "lucide-react"
import { ContentWidth } from "../../../components/layout/ContentWidth"
import { m } from "../../../paraglide/messages.js"
import { Sticker } from "./sticker"

const getFeatures = () =>
  [
    { id: "models", glyph: Bot, title: m.feature_models_title(), meta: m.feature_models_meta(), rotate: -2 },
    { id: "voice", glyph: MicAudioLines, title: m.feature_voice_title(), meta: m.feature_voice_meta(), rotate: 1.5 },
    { id: "personas", glyph: Drama, title: m.feature_personas_title(), meta: m.feature_personas_meta(), rotate: -1 },
    { id: "telegram", glyph: Send, title: m.feature_telegram_title(), meta: m.feature_telegram_meta(), rotate: 2 }
  ] as const

/** Four stamp tiles — titles only, no essays. */
export function FeatureStrip() {
  return (
    <section className="relative bg-surface-2/50">
      <div className="torn-edge bg-bg" />
      <ContentWidth className="py-12 sm:py-16">
        <div className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
          {getFeatures().map(f => (
            <div key={f.id} className="flex flex-col items-start gap-2">
              <Sticker tone="ghost" rotate={f.rotate} className="gap-1.5 text-xs sm:text-sm">
                <f.glyph size={14} strokeWidth={2} />
                {f.title}
              </Sticker>
              <p className="m-0 max-w-48 pl-1 font-display text-muted text-base">{f.meta}</p>
            </div>
          ))}
        </div>
        <a
          href="https://docs.kaja.io"
          target="_blank"
          rel="noopener"
          className="mt-10 inline-block font-crt text-neon text-base"
        >
          {m.features_docs()} →
        </a>
      </ContentWidth>
      <div className="torn-edge rotate-180 bg-bg" />
    </section>
  )
}
