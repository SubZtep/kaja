import { LandingSection, LandingSectionTitle } from "../../../components/ui/LandingSection"
import { Section } from "../../../components/ui/Section"

const ITEMS = [
  {
    title: "config.json",
    desc: (
      <>
        The only required group is <code className="font-mono text-muted">llm</code>. Add{" "}
        <code className="font-mono text-muted">stt</code>, <code className="font-mono text-muted">tts</code>,{" "}
        <code className="font-mono text-muted">location</code>, <code className="font-mono text-muted">webSearch</code>,
        or <code className="font-mono text-muted">telegram</code> groups to turn features on; leave one out and it's
        simply unavailable.
      </>
    )
  },
  {
    title: "models.toml",
    desc: (
      <>
        Every model your provider offers, so you can swap <code className="font-mono text-muted">llm.model</code>{" "}
        without re-entering credentials. The wizard writes a template matching your chosen provider on first run.
      </>
    )
  },
  {
    title: "mcp.toml",
    desc: "Model Context Protocol servers the agent can call — a standard way to plug in extra tools without changing Kaja itself."
  },
  {
    title: "personas/ & datasets/",
    desc: (
      <>
        One <code className="font-mono text-muted">.toml</code> per persona, one{" "}
        <code className="font-mono text-muted">.json</code> per dataset topic &mdash; the fields a persona should try to
        collect in conversation.
      </>
    )
  }
]

export function Configuration() {
  return (
    <LandingSection alt>
      <LandingSectionTitle
        title="Configuration"
        meta="~/.config/kaja/"
        description={
          <>
            Everything lives in plain files. Edit them by hand, or let{" "}
            <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-muted">kaja --wizard</code> write them for
            you.
          </>
        }
      />
      <Section className="mb-5 overflow-x-auto">
        <code className="block whitespace-pre font-mono text-[11px] text-fg sm:text-sm">
          {
            "~/.config/kaja/\n├─ config.json     one required group (llm), rest optional\n├─ models.toml     model catalog per provider\n├─ mcp.toml        Model Context Protocol tool servers\n├─ personas/*.toml one behaviour per file\n└─ datasets/*.json custom fields for personas to collect"
          }
        </code>
      </Section>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ITEMS.map(item => (
          <Section key={item.title}>
            <div className="mb-1.5 font-semibold text-fg text-sm">{item.title}</div>
            <div className="text-muted text-sm">{item.desc}</div>
          </Section>
        ))}
      </div>
    </LandingSection>
  )
}
