import type { AbilityKey } from "@kaja/schema/api"
import { Globe, KeyRound } from "lucide-react"
import { useState } from "react"
import { m } from "../../paraglide/messages.js"
import { ErrorNotice } from "../ui/ErrorNotice"
import { Loader } from "../ui/Loader"
import { KeyDialog } from "./KeyDialog"
import { useAbilityKeys, useRemoveAbilityKey } from "./queries"

const linkButton = "cursor-pointer text-muted text-xs underline-offset-2 hover:text-fg hover:underline"

/** The abilities that take a key, each with Add, or Replace and Remove; a key is stored encrypted and never shown again. */
export function ApiKeys() {
  const { data, error, isLoading } = useAbilityKeys()
  if (isLoading) return <Loader slim />
  if (error) return <ErrorNotice error={error} />
  if (!data?.keysEnabled) return <p className="m-0 text-muted text-sm">{m.tools_keys_unavailable()}</p>
  if (data.abilities.length === 0) return <p className="m-0 text-muted text-sm">{m.profile_api_keys_none()}</p>
  return (
    <ul className="m-0 grid list-none gap-4 p-0">
      {data.abilities.map(ability => (
        <ApiKeyRow key={ability.name} ability={ability} />
      ))}
    </ul>
  )
}

function ApiKeyRow({ ability }: Readonly<{ ability: AbilityKey }>) {
  const [open, setOpen] = useState(false)
  const remove = useRemoveAbilityKey()
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div className="min-w-0">
        <span className="font-mono font-semibold text-fg text-sm">{ability.name}</span>
        <p className="m-0 line-clamp-2 text-[13.5px] text-muted" title={ability.description}>
          {ability.description}
        </p>
        <p className="mt-1 mb-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted text-xs">
          <span className="inline-flex items-center gap-1">
            <Globe size={13} />
            <span className="font-mono">{ability.domain}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <KeyRound size={13} />
            {ability.key === "required" ? m.tools_key_required() : m.tools_key_optional()}
          </span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {ability.saved ? (
          <>
            <span className="text-neon-hi text-xs">{m.tools_key_saved()}</span>
            <button type="button" className={linkButton} onClick={() => setOpen(true)}>
              {m.tools_key_replace()}
            </button>
            <button
              type="button"
              className={linkButton}
              disabled={remove.isPending}
              onClick={() => remove.mutate(ability.name)}
            >
              {m.tools_key_remove()}
            </button>
          </>
        ) : (
          <button type="button" className={linkButton} onClick={() => setOpen(true)}>
            {m.tools_key_add()}
          </button>
        )}
      </div>
      <KeyDialog name={ability.name} domain={ability.domain} open={open} onOpenChange={setOpen} />
    </li>
  )
}
