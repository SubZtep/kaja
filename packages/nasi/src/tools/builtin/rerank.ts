import { z } from "zod"
import { ToolError, tool } from "../../agent/agent"
import type { ToolContext } from "../../agent/tools"
import { fetchPublicHttp } from "../../security/ssrf"
import { getToolDeps } from "../deps"

/**
 * Reranks a list of documents by relevance to a query, using the model
 * configured at models.rerank (resolved through models.toml).
 *
 * @param args.query - The search query to rank documents against.
 * @param args.documents - The documents to rank, most relevant first in the result.
 * @param args.top_n - Optional cap on how many ranked documents to return.
 */
export const rerankTool = tool({
  name: "rerank",
  description:
    "Rank a list of documents by relevance to a query, most relevant first. " +
    "Use this after search/retrieval to reorder or filter candidate passages " +
    "by relevance before reasoning over them.",
  schema: z.object({
    query: z.string().describe("The search query to rank documents against"),
    documents: z.array(z.string()).describe("The documents to rank"),
    top_n: z.int().optional().describe("Optional cap on how many top-ranked documents to return. Omit to return all.")
  }),
  execute: async (args, ctx) => JSON.stringify(await rerank(args, ctx))
})

/** The part of a (Cohere/Jina-style) rerank answer the tool reads. */
const RerankResponseSchema = z.object({
  data: z.array(z.object({ index: z.int(), relevance_score: z.number(), document: z.string().optional() }))
})

async function rerank(args: { query: string; documents: string[]; top_n?: number }, ctx?: ToolContext) {
  const resolved = getToolDeps().rerank?.(ctx?.personaId)
  if (!resolved) {
    throw new ToolError("rerank", "No rerank model configured")
  }
  const { baseUrl, apiKey, model } = resolved

  // The user's own rerank provider (local mode only, so a private host is fine); capped, timed out, and its key never follows a redirect elsewhere
  const res = await fetchPublicHttp(`${baseUrl.replace(/\/$/, "")}/rerank`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({
      model,
      query: args.query,
      documents: args.documents,
      ...(args.top_n ? { top_n: args.top_n } : {})
    }),
    allowPrivate: true,
    sameOriginRedirects: true,
    timeoutMs: 60_000,
    maxBytes: 5 * 1024 * 1024
  })
  if (!res.ok) throw new ToolError("rerank", `Rerank failed: ${res.status} ${await res.text()}`)
  const data = RerankResponseSchema.safeParse(await res.json().catch(() => undefined))
  if (!data.success) throw new ToolError("rerank", "Rerank answered in an unexpected shape")
  return data.data.data.map(result => ({
    index: result.index,
    relevance_score: result.relevance_score,
    document: result.document
  }))
}
