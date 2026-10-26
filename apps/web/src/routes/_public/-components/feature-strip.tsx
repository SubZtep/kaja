import { Brain, Drama, Globe, Image, PanelsTopLeft, Puzzle } from "lucide-react"
import { ContentWidth } from "../../../components/layout/content-width"
import { m } from "../../../paraglide/messages.js"
import { SectionTitle } from "./section-title"

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
    <section className="bg-surface-2/50 relative">
      <div className="torn-edge bg-bg" />
      <ContentWidth className="py-12 sm:py-16">
        <SectionTitle title={m.features_title()} />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {getFeatures().map(f => (
            <article key={f.id} className="toy-card bg-surface gap-2 p-4">
              <div className="flex items-center gap-2">
                <f.glyph size={20} strokeWidth={1.75} className="text-neon" aria-hidden />
                <h3 className="font-display text-fg m-0 text-base leading-tight font-bold">{f.title}</h3>
              </div>
              <p className="font-crt text-muted m-0 text-sm">{f.meta}</p>
            </article>
          ))}
        </div>
      </ContentWidth>
      <div className="torn-edge bg-bg rotate-180" />
    </section>
  )
}
