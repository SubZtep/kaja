import { defineModule } from "../contract"
import { collect, discover, DISCOVER_JOB, sources } from "./discover"
import { readingManifest } from "./manifest"
import { LINK, readingTools } from "./tools"

/**
 * A reading inbox: links saved with their text and topics, to list, read and put away from any chat, and stories found
 * for the topics the user follows.
 */
export const reading = defineModule(readingManifest, {
  tools: readingTools,
  prompt: {
    title: "Reading",
    tool: LINK,
    body:
      "The user has a reading inbox: links saved with their text and sorted by topic (the save_article, " +
      "list_articles, read_article and topic tools). Kaja also looks for new stories about the topics they follow " +
      "and keeps them as suggestions (list_articles with status suggested). When the user's whole message is a " +
      `link and nothing else, call ${LINK} with it instead of fetching it, and do what its result says. A link ` +
      "that comes with a question or an instruction is handled as usual."
  },
  jobs: [
    {
      id: "collect",
      scope: "global",
      everyMinutes: 6 * 60,
      hosts: sources.flatMap(source => source.hosts),
      run: async ctx => {
        await collect(ctx)
        return undefined
      }
    },
    {
      id: DISCOVER_JOB,
      scope: "user",
      everyMinutes: 24 * 60,
      run: async ctx => {
        const { state } = await discover(ctx, ctx.onModelCall)
        // Nothing to look for: the job comes back when a topic is followed or suggestions are switched on.
        return state === "off" || state === "no-topics" ? "done" : undefined
      }
    }
  ]
})
