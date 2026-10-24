/** Why generated source cannot be stored, or undefined when it is fine. */
export function sourceProblem(source: string): string | undefined {
  if (!source.trim()) return "Generated source was empty"
  if (source.includes("kwt_")) return "Generated source must not contain a widget token"
  if (/\bfetch\s*\(/.test(source) || /\bBun\b/.test(source) || /\bprocess\b/.test(source))
    return "Generated source must not use fetch, Bun, or process"
  return undefined
}

/** The first fenced block, or the whole reply when it already looks like source. */
export function extractSource(reply: string, kind: "browser" | "server"): string | undefined {
  const fence = /```(?:html|javascript|js)?\s*([\s\S]*?)```/i.exec(reply)
  const body = (fence?.[1] ?? reply).trim()
  if (!body) return undefined
  if (kind === "browser" && (body.startsWith("<") || fence)) return body
  if (kind === "server" && (body.includes("function play") || fence)) return body
  return undefined
}
