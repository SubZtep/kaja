import { readArticle } from "@kaja/nasi"
import type { ModuleContext } from "../contract"
import type { PageWrite } from "./store"

/** What's kept of a page's text; a longer one is cut there (its word count still covers all of it). */
export const MAX_CONTENT_CHARS = 200_000

export function hostOf(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "")
}

/** The page behind a link as the store keeps it; a page that can't be read is kept as the reason why. */
export async function readPage(url: string, send: ModuleContext["send"]): Promise<PageWrite> {
  try {
    const page = await readArticle(url, { send })
    const words = page.markdown.split(/\s+/).filter(Boolean).length
    return {
      title: page.title,
      site: page.siteName ?? hostOf(url),
      author: page.byline,
      content: page.markdown.slice(0, MAX_CONTENT_CHARS),
      wordCount: words
    }
  } catch (error) {
    return { site: hostOf(url), wordCount: 0, fetchError: error instanceof Error ? error.message : String(error) }
  }
}
