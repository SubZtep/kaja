import { ChevronRight } from "lucide-react"
import { LandingSection, LandingSectionTitle } from "../../../components/ui/LandingSection"
import { Section } from "../../../components/ui/Section"
import { m } from "../../../paraglide/messages.js"

// Read via a function (not a module-scope constant) so descriptions re-evaluate per render —
// `m.*()` calls captured at module load can go stale across the SSR/hydration boundary.
const getTools = () => [
  { name: "custom ip2geo mcp", desc: m.configuration_tool_ip2geo_desc() },
  { name: "current_time", desc: m.configuration_tool_current_time_desc() },
  { name: "read_file", desc: m.configuration_tool_read_file_desc() },
  { name: "list_files", desc: m.configuration_tool_list_files_desc() },
  { name: "fetch_url", desc: m.configuration_tool_fetch_url_desc() },
  { name: "web_search", desc: m.configuration_tool_web_search_desc() },
  { name: "view_image", desc: m.configuration_tool_view_image_desc() },
  { name: "generate_image", desc: m.configuration_tool_generate_image_desc() },
  { name: "summarize", desc: m.configuration_tool_summarize_desc() },
  { name: "rerank", desc: m.configuration_tool_rerank_desc() },
  { name: "memory", desc: m.configuration_tool_memory_desc() },
  { name: "dataset_info", desc: m.configuration_tool_dataset_info_desc() }
]

export function Configuration() {
  return (
    <LandingSection alt>
      <LandingSectionTitle
        title={m.configuration_title()}
        meta={
          <div className="flex items-center gap-1">
            <ChevronRight />
            <a href="https://github.com/SubZtep/kaja/discussions/40" target="_blank" rel="noopener">
              {m.configuration_meta_link()}
            </a>
          </div>
        }
        description={m.configuration_description()}
      />
      <Section className="border-0 p-0 sm:border sm:px-6 sm:py-6">
        <div className="mb-3.5 font-semibold text-fg text-sm"></div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {getTools().map(tool => (
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
