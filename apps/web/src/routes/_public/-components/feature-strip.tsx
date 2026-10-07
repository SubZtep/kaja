import { Brain, Drama, Globe, Image, PanelsTopLeft, Puzzle } from "lucide-react"
import { ContentWidth } from "../../../components/layout/ContentWidth"
import { m } from "../../../paraglide/messages.js"

const getFeatures = () =>
  [
    { id: "browse", glyph: Globe, title: m.feature_browse_title(), meta: m.feature_browse_meta() },
    { id: "memory", glyph: Brain, title: m.feature_memory_title(), meta: m.feature_memory_meta() },
    { id: "personas", glyph: Drama, title: m.feature_personas_title(), meta: m.feature_personas_meta() },
    { id: "images", glyph: Image, title: m.feature_images_title(), meta: m.feature_images_meta() },
    { id: "widget", glyph: PanelsTopLeft, title: m.feature_widget_title(), meta: m.feature_widget_meta() },
    { id: "abilities", glyph: Puzzle, title: m.feature_abilities_title(), meta: m.feature_abilities_meta() }
  ] as const

/** Claim tiles: what the agent can do, one big line and one plain line each. */
export function FeatureStrip() {
  return (
    <section className="relative bg-surface-2/50">
      <div className="torn-edge bg-bg" />
      <ContentWidth className="py-12 sm:py-16">
        <h2 className="m-0 mb-6 font-bold font-display text-fg text-xl md:text-2xl">{m.features_title()}</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {getFeatures().map(f => (
            <article key={f.id} className="toy-card gap-2 bg-surface p-4">
              <f.glyph size={20} strokeWidth={1.75} className="text-neon" aria-hidden />
              <h3 className="m-0 font-bold font-display text-base text-fg leading-tight">{f.title}</h3>
              <p className="m-0 font-crt text-muted text-sm">{f.meta}</p>
            </article>
          ))}
        </div>
        <a
          href="https://docs.kaja.io"
          target="_blank"
          rel="noopener"
          className="mt-10 inline-block font-crt text-base text-neon"
        >
          {m.features_docs()} →
        </a>
      </ContentWidth>
      <div className="torn-edge rotate-180 bg-bg" />
    </section>
  )
}
