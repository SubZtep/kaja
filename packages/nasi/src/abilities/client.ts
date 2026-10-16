import type { NasiClientSkill, NasiClientTool, NasiToolResult } from "@kaja/schema/nasi"
import type { Session } from "../agent/agent"
import { recordCall } from "../agent/telemetry"
import { type Tool, tool } from "../agent/tools"
import type { ToolGroup } from "../tools/registry"
import type { AbilityStore } from "./types"

/** What a cloud turn's client runs on the user's computer, declared with the turn. */
export type NasiClient = { tools: NasiClientTool[]; skills: NasiClientSkill[] }

/** The answer a call gets when the client went away before running it. */
export const CLIENT_GONE =
  "Not run: the user's computer went away before it could run this. Don't retry it unless the user asks."

/** The abilities the client runs: every part of them comes from the client, none from the host's store. */
export function clientAbilities(client: NasiClient): Set<string> {
  return new Set([
    ...client.tools.flatMap(declared => (declared.ability ? [declared.ability] : [])),
    ...client.skills.map(skill => skill.name)
  ])
}

/**
 * The client's tools as tool groups for `createTools`: each runs on the client (run() pauses for it, see
 * `Tool.runsOnClient`), never here. An ability's tools carry its source, so personas pick them like any ability's;
 * builtins (read_file, run_command, …) are official.
 */
export function clientToolGroups(client: NasiClient): ToolGroup[] {
  const byAbility = new Map<string | undefined, Tool[]>()
  for (const declared of client.tools) {
    const stub: Tool = {
      ...tool<Record<string, unknown>>({
        name: declared.name,
        description: declared.description,
        parameters: declared.parameters,
        execute: () => Promise.reject(new Error(`${declared.name} runs on the user's computer, not here`))
      }),
      runsOnClient: true
    }
    byAbility.set(declared.ability, [...(byAbility.get(declared.ability) ?? []), stub])
  }
  return [...byAbility].map(([ability, tools]) =>
    ability
      ? { origin: "community" as const, source: `ability:${ability}`, tools }
      : { origin: "official" as const, tools }
  )
}

/**
 * `store` with the client's abilities in place of its own copies: their tools and servers left out (the client runs
 * them), their skills listed from the client (a sticky one's body too, for the system prompt; load_skill asks the client
 * for the rest).
 */
export function withClientAbilities(store: AbilityStore, client: NasiClient): AbilityStore {
  const theirs = clientAbilities(client)
  const skills = new Map(client.skills.map(skill => [skill.name, skill]))
  return {
    listSkills: async () => [
      ...(await store.listSkills()).filter(skill => !theirs.has(skill.name)),
      ...client.skills.map(({ body: _body, ...summary }) => summary)
    ],
    readSkill: async (name, file) => {
      if (skills.has(name)) return file ? undefined : skills.get(name)?.body
      return theirs.has(name) ? undefined : store.readSkill(name, file)
    },
    listHttpTools: async () => (await store.listHttpTools()).filter(ability => !theirs.has(ability.name)),
    listMcpAbilities: async () => (await store.listMcpAbilities()).filter(ability => !theirs.has(ability.name))
  }
}

/**
 * Answers the calls the session waits on with the client's results, in the order the model made them; a call without
 * one gets {@link CLIENT_GONE}. Images follow as one user message, since a tool message can't carry them. Each call's
 * status is recorded as the client reports it (a missing one as skipped).
 */
export function answerClientCalls(session: Session, results: NasiToolResult[] = []): void {
  const pending = session.pendingClientCalls
  if (!pending?.length) return
  const byId = new Map(results.map(result => [result.id, result]))
  const images: string[] = []
  for (const id of pending) {
    const result = byId.get(id)
    session.messages.push({ role: "tool", tool_call_id: id, content: result?.text ?? CLIENT_GONE })
    const status = result ? (result.status ?? "ok") : "skipped"
    recordCall(session, id, status === "declined" ? { status, approval: "declined" } : { status })
    for (const image of result?.images ?? []) images.push(`data:${image.mimeType};base64,${image.data}`)
  }
  if (images.length)
    session.messages.push({ role: "user", content: images.map(url => ({ type: "image_url", image_url: { url } })) })
  session.pendingClientCalls = undefined
}
