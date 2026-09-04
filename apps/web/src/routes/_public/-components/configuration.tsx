import { ChevronRight } from "lucide-react"
import { LandingSection, LandingSectionTitle } from "../../../components/ui/LandingSection"
import { Section } from "../../../components/ui/Section"

const TOOLS = [
  { name: "custom ip2geo mcp", desc: "Convert IP to city level location" },
  { name: "current_time", desc: "Current date/time in any IANA timezone" },
  { name: "read_file", desc: "Read a text file" },
  { name: "list_files", desc: "List a directory" },
  { name: "fetch_url", desc: "Fetch a URL and extract to text" },
  { name: "web_search", desc: "Location based web search via Brave API" },
  { name: "view_image", desc: "See an image’s contents" },
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
        title="Built-in Tools & MCP Clients"
        meta={
          <div className="flex items-center gap-1">
            <ChevronRight />
            <a href="https://github.com/SubZtep/kaja/discussions/40" target="_blank" rel="noopener">
              Have a favourite MCP or skill?
            </a>
          </div>
        }
        description={
          <>
            Easily extendable plain files. Fetch templates during onboarding and edit them by hand if tweaking is
            necessary.
          </>
        }
      />
      <Section className="border-0 p-0 sm:border sm:px-6 sm:py-6">
        <div className="mb-3.5 font-semibold text-fg text-sm"></div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map(tool => (
            <div key={tool.name} className="rounded-lg border border-border/50 bg-transparent p-2">
              <code className="block whitespace-nowrap font-mono text-neon text-sm">{tool.name}</code>
              <span className="mt-1 block text-muted text-sm">{tool.desc}</span>
            </div>
          ))}
        </div>
      </Section>
    </LandingSection>
  )
}
