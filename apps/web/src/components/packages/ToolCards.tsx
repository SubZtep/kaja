import type { CatalogPackage, HttpToolDetail } from "@kaja/schema/api"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Globe, KeyRound } from "lucide-react"
import { useState } from "react"
import { toast } from "react-toastify"
import { useApiFetch } from "../../lib/api-fetch"
import { m } from "../../paraglide/messages.js"
import { Checkbox } from "../form/primitives/Checkbox"
import { ErrorNotice } from "../ui/ErrorNotice"
import { Loader } from "../ui/Loader"
import { Section } from "../ui/Section"
import { KeyDialog } from "./KeyDialog"
import { MY_PACKAGES_QUERY_KEY, useCatalog, useMyPackages, useTogglePackage } from "./queries"
import { UnavailablePackages } from "./UnavailablePackages"

const KEY_NEED_LABEL: Record<HttpToolDetail["key"], () => string> = {
  none: m.tools_key_none,
  required: m.tools_key_required,
  optional: m.tools_key_optional
}

const linkButton = "cursor-pointer text-muted text-xs underline-offset-2 hover:text-fg hover:underline"

function ToolCard({
  tool,
  http,
  enabled,
  hasKey,
  keysEnabled,
  pending,
  onToggle
}: Readonly<{
  tool: CatalogPackage
  http: HttpToolDetail
  enabled: boolean
  hasKey: boolean
  keysEnabled: boolean
  pending: boolean
  onToggle: (on: boolean) => void
}>) {
  const apiFetch = useApiFetch()
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<"closed" | "key" | "enable">("closed")

  const removeKey = useMutation({
    mutationFn: () =>
      apiFetch(`/packages/me/tool/${encodeURIComponent(tool.name)}/key`, undefined, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: MY_PACKAGES_QUERY_KEY })
      toast.success(m.tools_key_removed({ name: tool.name }))
    },
    onError: (err: Error) => toast.error(err.message || m.tools_key_error())
  })

  // A tool that can't work without a key asks for it first; everything else toggles straight away.
  const toggle = (on: boolean) => (on && http.key === "required" && !hasKey ? setDialog("enable") : onToggle(on))

  return (
    <Section className="h-full">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 font-mono font-semibold text-fg text-sm">{tool.name}</div>
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
          <span className="font-mono">{http.domain}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <KeyRound size={13} />
          {KEY_NEED_LABEL[http.key]()}
        </span>
      </p>

      <ul className="mt-3 mb-0 grid list-none gap-1 p-0">
        {http.tools.map(item => (
          <li key={item.name} className="text-xs">
            <span className="font-mono text-fg">{item.name}</span>{" "}
            <span className="font-mono text-muted">{item.method}</span>
            {item.method !== "GET" && <span className="text-ice"> · {m.tools_asks_first()}</span>}
          </li>
        ))}
      </ul>

      {http.key !== "none" && keysEnabled && (
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
            http.key === "optional" && (
              <button type="button" className={linkButton} onClick={() => setDialog("key")}>
                {m.tools_key_add()}
              </button>
            )
          )}
        </div>
      )}

      <KeyDialog
        name={tool.name}
        domain={http.domain}
        open={dialog !== "closed"}
        onOpenChange={open => !open && setDialog("closed")}
        enableAfter={dialog === "enable"}
      />
    </Section>
  )
}

/**
 * Catalog HTTP tools as cards: where each one calls, whether it needs your key, and what it can do
 * (anything but GET asks before running). Turning on one that requires a key asks for the key first.
 */
export function ToolCards() {
  const catalog = useCatalog()
  const mine = useMyPackages()
  const toggle = useTogglePackage()

  if (catalog.isLoading || mine.isLoading) return <Loader />
  const tools = (catalog.data ?? []).flatMap(pkg => (pkg.type === "tool" && pkg.http ? [{ pkg, http: pkg.http }] : []))
  const enabled = new Set((mine.data?.packages ?? []).filter(p => p.type === "tool").map(p => p.name))
  const keys = new Set(mine.data?.keys ?? [])
  const keysEnabled = mine.data?.keysEnabled ?? false
  const pendingName = toggle.isPending ? toggle.variables?.name : undefined

  return (
    <>
      <ErrorNotice error={catalog.error ?? mine.error} />
      {mine.data && !keysEnabled && <p className="mt-0 mb-4 text-muted text-sm">{m.tools_keys_unavailable()}</p>}
      {tools.length === 0 ? (
        <Section>
          <p className="m-0 text-muted text-sm">{m.tools_empty()}</p>
        </Section>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {tools.map(({ pkg, http }) => (
            <ToolCard
              key={pkg.name}
              tool={pkg}
              http={http}
              enabled={enabled.has(pkg.name)}
              hasKey={keys.has(pkg.name)}
              keysEnabled={keysEnabled}
              pending={pendingName === pkg.name}
              onToggle={on => toggle.mutate({ type: "tool", name: pkg.name, on })}
            />
          ))}
        </div>
      )}
      <UnavailablePackages type="tool" />
    </>
  )
}
