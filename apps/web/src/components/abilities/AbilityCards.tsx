import { m } from "../../paraglide/messages.js"
import { ErrorNotice } from "../ui/ErrorNotice"
import { Loader } from "../ui/Loader"
import { Section } from "../ui/Section"
import { useCatalog, useMyAbilities, useToggleAbility } from "./queries"
import { SkillCard } from "./SkillCard"
import { ToolCard, toolEntry } from "./ToolCard"
import { UnavailableAbilities } from "./UnavailableAbilities"

/**
 * Every catalog skill, HTTP tool and MCP server in one list by name (how they run is an implementation
 * detail): an on/off toggle saved immediately, then any enabled one that has since left the marketplace so it
 * can be turned off. Turning on one that requires a key asks for the key first.
 */
export function AbilityCards() {
  const catalog = useCatalog()
  const mine = useMyAbilities()
  const toggle = useToggleAbility()

  if (catalog.isLoading || mine.isLoading) return <Loader />
  const abilities = (catalog.data ?? [])
    .filter(ability => ability.type === "skill" || toolEntry(ability))
    .sort((a, b) => a.name.localeCompare(b.name))
  const enabled = new Set((mine.data?.abilities ?? []).map(p => `${p.type}:${p.name}`))
  const keys = new Set(mine.data?.keys ?? [])
  const keysEnabled = mine.data?.keysEnabled ?? false
  const pendingId = toggle.isPending ? `${toggle.variables?.type}:${toggle.variables?.name}` : undefined

  return (
    <>
      <ErrorNotice error={catalog.error ?? mine.error} />
      {mine.data && !keysEnabled && <p className="mt-0 mb-4 text-muted text-sm">{m.tools_keys_unavailable()}</p>}
      {abilities.length === 0 ? (
        <Section>
          <p className="m-0 text-muted text-sm">{m.abilities_empty()}</p>
        </Section>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {abilities.map(ability => {
            const id = `${ability.type}:${ability.name}`
            const entry = toolEntry(ability)
            return entry ? (
              <ToolCard
                key={id}
                entry={entry}
                enabled={enabled.has(id)}
                hasKey={keys.has(ability.name)}
                keysEnabled={keysEnabled}
                pending={pendingId === id}
                onToggle={on => toggle.mutate({ type: entry.type, name: ability.name, on })}
              />
            ) : (
              <SkillCard
                key={id}
                skill={ability}
                enabled={enabled.has(id)}
                pending={pendingId === id}
                onToggle={on => toggle.mutate({ type: "skill", name: ability.name, on })}
              />
            )
          })}
        </div>
      )}
      <UnavailableAbilities types={["skill", "tool", "mcp"]} />
    </>
  )
}
