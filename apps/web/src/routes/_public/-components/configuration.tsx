import { LandingSection, LandingSectionTitle } from "../../../components/ui/LandingSection"
import { Section } from "../../../components/ui/Section"

const TOOLS = [
  { name: "current_time", desc: "Current date/time in any IANA timezone" },
  { name: "read_file", desc: "Read a text file" },
  { name: "list_files", desc: "List a directory" },
  { name: "fetch_url", desc: "Fetch a URL and extract to text" },
  { name: "web_search", desc: "Locaction based web search via Brave API" },
  { name: "view_image", desc: "See an image's contents" },
  { name: "generate_image", desc: "Generate an image from a prompt" },
  { name: "summarize", desc: "Summarize text" },
  { name: "rerank", desc: "Rank documents against a query" },
  { name: "memory", desc: "Remember durable facts across sessions" },
  { name: "dataset_info", desc: "Track persona dataset collection progress" }
]

export function Configuration() {
  return (
    <LandingSection alt>
      <LandingSectionTitle
        title="Configuration"
        meta="~/.config/kaja/"
        description={
          <>
            Everything lives in plain files. Fetch templates during onboarding and edit them by hand if tweaking is
            necessary.
          </>
        }
      />
      <Section className="mb-5 overflow-x-auto">
        <code className="block whitespace-pre font-mono text-[11px] text-fg sm:text-sm">
          {
            "~/.config/kaja/\n├─ settings.json    # optional settings and app preferences\n├─ models.toml      # model catalog per provider\n├─ mcp.toml         # model context protocol servers\n├─ personas/*.toml  # one behaviour per file\n└─ datasets/*.json  # custom fields for personas to collect"
          }
        </code>
      </Section>
      <Section>
        <div className="mb-3.5 font-semibold text-fg text-sm">Built-in tools</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map(tool => (
            <div key={tool.name} className="rounded-lg border border-border/50 bg-surface-2 p-3.5">
              <code className="block whitespace-nowrap font-mono text-neon text-sm">{tool.name}</code>
              <span className="mt-1 block text-muted text-sm">{tool.desc}</span>
            </div>
          ))}
        </div>
      </Section>
    </LandingSection>
  )
}
