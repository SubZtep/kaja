import type { AbilityKeyNeed, CatalogAbility, KeyedAbilityType, McpDetail } from "@kaja/schema/api"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Globe, KeyRound } from "lucide-react"
import { useState } from "react"
import { toast } from "react-toastify"
import { useApiFetch } from "../../lib/api-fetch"
import { m } from "../../paraglide/messages.js"
import { Checkbox } from "../form/primitives/Checkbox"
import { Badge } from "../ui/Badge"
import { ErrorNotice } from "../ui/ErrorNotice"
import { Loader } from "../ui/Loader"
import { Section } from "../ui/Section"
import { KeyDialog } from "./KeyDialog"
import { MY_ABILITIES_QUERY_KEY, useCatalog, useMyAbilities, useToggleAbility } from "./queries"
import { UnavailableAbilities } from "./UnavailableAbilities"

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
type ToolEntry = {
  ability: CatalogAbility
  type: KeyedAbilityType
  domain: string
  key: AbilityKeyNeed
  /** Each tool, with the method for HTTP tools. */
  items: { name: string; method?: string }[]
  /** When an MCP server's calls wait for the user's OK. */
  approvalNote?: string
}

/** A catalog tool or MCP entry as a card, or undefined for anything else. */
function toolEntry(ability: CatalogAbility): ToolEntry | undefined {
  if (ability.type === "tool" && ability.http) {
    const { domain, key, tools } = ability.http
    return { ability, type: "tool", domain, key, items: tools.map(({ name, method }) => ({ name, method })) }
  }
  if (ability.type === "mcp" && ability.mcp) {
    const { domain, key, tools, approval } = ability.mcp
    return {
      ability,
      type: "mcp",
      domain,
      key,
      items: tools.map(name => ({ name })),
      approvalNote: MCP_APPROVAL_NOTE[approval]?.()
    }
  }
  return undefined
}

const linkButton = "cursor-pointer text-muted text-xs underline-offset-2 hover:text-fg hover:underline"

function ToolCard({
  entry,
  enabled,
  hasKey,
  keysEnabled,
  pending,
  onToggle
}: Readonly<{
  entry: ToolEntry
  enabled: boolean
  hasKey: boolean
  keysEnabled: boolean
  pending: boolean
  onToggle: (on: boolean) => void
}>) {
  const { ability: tool, type } = entry
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<"closed" | "key" | "enable">("closed")

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
          <p className="m-0 text-[13.5px] text-muted">{tool.description}</p>
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

      <KeyDialog
        type={type}
        name={tool.name}
        domain={entry.domain}
        open={dialog !== "closed"}
        onOpenChange={open => !open && setDialog("closed")}
        enableAfter={dialog === "enable"}
      />
    </Section>
  )
}

/**
 * Catalog HTTP tools and MCP servers as cards: where each one connects, whether it needs your key, and
 * what it can do (and when it asks first). Turning on one that requires a key asks for the key first.
 */
export function ToolCards() {
  const catalog = useCatalog()
  const mine = useMyAbilities()
  const toggle = useToggleAbility()

  if (catalog.isLoading || mine.isLoading) return <Loader />
  const entries = (catalog.data ?? []).map(toolEntry).filter(entry => entry !== undefined)
  const enabled = new Set((mine.data?.abilities ?? []).filter(p => p.type !== "skill").map(p => `${p.type}:${p.name}`))
  const keys = new Set(mine.data?.keys ?? [])
  const keysEnabled = mine.data?.keysEnabled ?? false
  const pendingName = toggle.isPending ? `${toggle.variables?.type}:${toggle.variables?.name}` : undefined

  return (
    <>
      <ErrorNotice error={catalog.error ?? mine.error} />
      {mine.data && !keysEnabled && <p className="mt-0 mb-4 text-muted text-sm">{m.tools_keys_unavailable()}</p>}
      {entries.length === 0 ? (
        <Section>
          <p className="m-0 text-muted text-sm">{m.tools_empty()}</p>
        </Section>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {entries.map(entry => {
            const id = `${entry.type}:${entry.ability.name}`
            return (
              <ToolCard
                key={id}
                entry={entry}
                enabled={enabled.has(id)}
                hasKey={keys.has(entry.ability.name)}
                keysEnabled={keysEnabled}
                pending={pendingName === id}
                onToggle={on => toggle.mutate({ type: entry.type, name: entry.ability.name, on })}
              />
            )
          })}
        </div>
      )}
      <UnavailableAbilities types={["tool", "mcp"]} />
    </>
  )
}
