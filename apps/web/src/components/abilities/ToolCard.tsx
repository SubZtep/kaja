import type { CatalogAbility, McpDetail } from "@kaja/schema/api"
import { Globe } from "lucide-react"
import { m } from "../../paraglide/messages.js"
import { Checkbox } from "../form/primitives/Checkbox"
import { Badge } from "../ui/Badge"
import { Section } from "../ui/Section"

const MCP_APPROVAL_NOTE: Record<McpDetail["approval"], (() => string) | undefined> = {
  never: undefined,
  writes: m.tools_mcp_asks_writes,
  always: m.tools_mcp_asks_always
}

/** What a card shows of an HTTP tool or MCP server ability. */
export type ToolEntry = {
  ability: CatalogAbility
  type: "tool" | "mcp"
  domain: string
  /** Each tool, with the method for HTTP tools. */
  items: { name: string; method?: string }[]
  /** When an MCP server's calls wait for the user's OK. */
  approvalNote?: string
}

/** A catalog tool or MCP entry as a card, or undefined for anything else. */
export function toolEntry(ability: CatalogAbility): ToolEntry | undefined {
  if (ability.type === "tool" && ability.http) {
    const { domain, tools } = ability.http
    return { ability, type: "tool", domain, items: tools.map(({ name, method }) => ({ name, method })) }
  }
  if (ability.type === "mcp" && ability.mcp) {
    const { domain, tools, approval } = ability.mcp
    return {
      ability,
      type: "mcp",
      domain,
      items: tools.map(name => ({ name })),
      approvalNote: MCP_APPROVAL_NOTE[approval]?.()
    }
  }
  return undefined
}

export function ToolCard({
  entry,
  enabled,
  pending,
  onToggle
}: Readonly<{
  entry: ToolEntry
  enabled: boolean
  pending: boolean
  onToggle: (on: boolean) => void
}>) {
  const { ability: tool, type } = entry

  return (
    <Section className="h-full">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="font-mono font-semibold text-fg text-sm">{tool.name}</span>
            {type === "mcp" && <Badge>{m.tools_mcp_badge()}</Badge>}
          </div>
          <p className="m-0 text-[13.5px] text-muted">{tool.description}</p>
        </div>
        <Checkbox
          className="shrink-0"
          checked={enabled}
          disabled={pending}
          aria-label={m.skills_toggle({ name: tool.name })}
          onCheckedChange={onToggle}
        />
      </div>

      <p className="mt-3 mb-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted text-xs">
        <span className="inline-flex items-center gap-1">
          <Globe size={13} />
          <span className="font-mono">{entry.domain}</span>
        </span>
      </p>

      <ul className="mt-3 mb-0 grid list-none gap-1 p-0">
        {entry.items.map(item => (
          <li key={item.name} className="text-xs">
            <span className="font-mono text-fg">{item.name}</span>
            {item.method && <span className="font-mono text-muted"> {item.method}</span>}
            {item.method && item.method !== "GET" && <span className="text-ice"> · {m.tools_asks_first()}</span>}
          </li>
        ))}
      </ul>
      {entry.approvalNote && <p className="mt-2 mb-0 text-ice text-xs">{entry.approvalNote}</p>}
    </Section>
  )
}
