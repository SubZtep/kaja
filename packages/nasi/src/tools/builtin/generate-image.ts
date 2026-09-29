import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import { randomUUIDv7 } from "@kaja/shared/id"
import { write } from "bun"
import OpenAI from "openai"
import { z } from "zod"
import { ToolError, tool } from "../../agent/agent"
import { fetchPublicHttp } from "../../security/ssrf"
import { getToolDeps } from "../deps"

/**
 * Generates an image from a text prompt via an OpenAI-compatible Images API
 * (e.g. xAI's Grok Imagine) and saves it to a temp file.
 *
 * @param args.prompt - Description of the image to generate.
 * @returns A {@link ToolResult} carrying the saved image; run() injects it as
 * a vision content block in a follow-up user message.
 */
export const generateImageTool = tool({
  name: "generate_image",
  description: "Generate an image from a text prompt.",
  schema: z.object({
    prompt: z.string().describe("Description of the image to generate")
  }),
  execute: async (args, ctx) => {
    const imageGen = getToolDeps().imageGeneration?.(ctx?.personaId)
    if (!imageGen) return "Image generation is not configured."

    const client = new OpenAI({
      apiKey: imageGen.apiKey ?? "",
      baseURL: imageGen.baseUrl
    })
    const response = await client.images.generate({
      model: imageGen.model,
      prompt: args.prompt
    })
    const url = response.data?.[0]?.url
    if (!url) return "Image generation returned no image."

    // The URL is whatever the provider answered: capped and timed out like any fetch. Local mode only (the TUI configures
    // this tool), where a provider on the user's own network is fine.
    const res = await fetchPublicHttp(url, { allowPrivate: true, timeoutMs: 60_000, maxBytes: 20 * 1024 * 1024 })
    if (!res.ok) throw new ToolError("generate_image", `Failed to download generated image: ${res.status}`)
    const mimeType = res.headers.get("content-type") ?? "image/png"
    const ext = mimeType.split("/")[1] ?? "png"

    const dir = getToolDeps().tempDir
    if (!dir) return "Image generation is not configured."
    await mkdir(dir, { recursive: true })
    const path = join(dir, `${randomUUIDv7()}.${ext}`)
    await write(path, await res.arrayBuffer())

    return {
      text: `Generated image: ${args.prompt}`,
      images: [{ path, mimeType }]
    }
  }
})
