import type { AbilityKeyNeed, CatalogAbility, KeyedAbilityType, McpDetail } from "@kaja/schema/api"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Globe, KeyRound, ListTree } from "lucide-react"
import { useState } from "react"
import { toast } from "react-toastify"
import { useApiFetch } from "../../lib/api-fetch"
import { m } from "../../paraglide/messages.js"
import { Checkbox } from "../form/primitives/Checkbox"
import { Badge } from "../ui/Badge"
import { Section } from "../ui/Section"
import { KeyDialog } from "./KeyDialog"
import { MY_ABILITIES_QUERY_KEY } from "./queries"
import { ToolsDialog } from "./ToolsDialog"

const KEY_NEED_LABEL: Record<AbilityKeyNeed, () => string> = {
  none: m.tools_key_none,
  required: m.tools_key_required,
  optional: m.tools_key_optional
}

const MCP_APPROVAL_NOTE: Record<McpDetail["approval"], (() => string) | undefined> = {
  never: undefined,
  writes: m.tools_mcp_asks_writes,
  always: m.tools_mcp_asks_always
}

/** What a card shows of an HTTP tool or MCP server ability. */
export type ToolEntry = {
  ability: CatalogAbility
  type: KeyedAbilityType
  domain: string
  key: AbilityKeyNeed
  /** Each tool, with what it does (and the method for HTTP tools). */
  items: { name: string; method?: string; description?: string }[]
  /** When an MCP server's calls wait for the user's OK. */
  approvalNote?: string
}

/** A catalog tool or MCP entry as a card, or undefined for anything else. */
export function toolEntry(ability: CatalogAbility): ToolEntry | undefined {
  if (ability.type === "tool" && ability.http) {
    const { domain, key, tools } = ability.http
    return {
      ability,
      type: "tool",
      domain,
      key,
      items: tools.map(({ name, method, description }) => ({ name, method, description }))
    }
  }
  if (ability.type === "mcp" && ability.mcp) {
    const { domain, key, tools, approval } = ability.mcp
    return {
      ability,
      type: "mcp",
      domain,
      key,
      items: tools.map(({ name, description }) => ({ name, description })),
      approvalNote: MCP_APPROVAL_NOTE[approval]?.()
    }
  }
  return undefined
}

const linkButton = "cursor-pointer text-muted text-xs underline-offset-2 hover:text-fg hover:underline"

export function ToolCard({
  entry,
  enabled,
  disabledTools,
  allowedTools,
  hasKey,
  keysEnabled,
  pending,
  onToggle
}: Readonly<{
  entry: ToolEntry
  enabled: boolean
  /** Its tools the user switched off. */
  disabledTools: string[]
  allowedTools: string[]
  hasKey: boolean
  keysEnabled: boolean
  pending: boolean
  onToggle: (on: boolean) => void
}>) {
  const { ability: tool, type } = entry
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<"closed" | "key" | "enable" | "tools">("closed")

  const removeKey = useMutation({
    mutationFn: () =>
      apiFetch(`/abilities/me/${type}/${encodeURIComponent(tool.name)}/key`, undefined, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MY_ABILITIES_QUERY_KEY })
      toast.success(m.tools_key_removed({ name: tool.name }))
    },
    onError: (err: Error) => toast.error(err.message || m.tools_key_error())
  })

  // A tool that can't work without a key asks for it first; everything else toggles straight away.
  const toggle = (on: boolean) => (on && entry.key === "required" && !hasKey ? setDialog("enable") : onToggle(on))

  return (
    <Section className="h-full">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="font-mono font-semibold text-fg text-sm">{tool.name}</span>
            {type === "mcp" && <Badge>{m.tools_mcp_badge()}</Badge>}
          </div>
          <p className="m-0 line-clamp-3 text-[13.5px] text-muted" title={tool.description}>
            {tool.description}
          </p>
        </div>
        <Checkbox
          className="shrink-0"
          checked={enabled}
          disabled={pending}
          aria-label={m.skills_toggle({ name: tool.name })}
          onCheckedChange={toggle}
        />
      </div>

      <p className="mt-3 mb-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted text-xs">
        <span className="inline-flex items-center gap-1">
          <Globe size={13} />
          <span className="font-mono">{entry.domain}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <KeyRound size={13} />
          {KEY_NEED_LABEL[entry.key]()}
        </span>
        {/* The tool list lives in a dialog, so every card stays one size however many tools it has */}
        <button
          type="button"
          className={`inline-flex items-center gap-1 ${linkButton}`}
          onClick={() => setDialog("tools")}
        >
          <ListTree size={13} />
          {enabled && disabledTools.length > 0
            ? m.tools_list_button_some({ on: entry.items.length - disabledTools.length, count: entry.items.length })
            : m.tools_list_button({ count: entry.items.length })}
        </button>
      </p>

      {entry.key !== "none" && keysEnabled && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          {hasKey ? (
            <>
              <span className="text-neon-hi text-xs">{m.tools_key_saved()}</span>
              <button type="button" className={linkButton} onClick={() => setDialog("key")}>
                {m.tools_key_replace()}
              </button>
              <button
                type="button"
                className={linkButton}
                disabled={removeKey.isPending}
                onClick={() => removeKey.mutate()}
              >
                {m.tools_key_remove()}
              </button>
            </>
          ) : (
            entry.key === "optional" && (
              <button type="button" className={linkButton} onClick={() => setDialog("key")}>
                {m.tools_key_add()}
              </button>
            )
          )}
        </div>
      )}

      <ToolsDialog
        entry={entry}
        enabled={enabled}
        disabledTools={disabledTools}
        allowedTools={allowedTools}
        open={dialog === "tools"}
        onOpenChange={open => !open && setDialog("closed")}
      />
      <KeyDialog
        type={type}
        name={tool.name}
        domain={entry.domain}
        open={dialog === "key" || dialog === "enable"}
        onOpenChange={open => !open && setDialog("closed")}
        enableAfter={dialog === "enable"}
      />
    </Section>
  )
}
