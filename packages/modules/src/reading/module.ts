import { defineModule } from "../contract"
import { readingManifest } from "./manifest"
import { LINK, readingTools } from "./tools"

/** A reading inbox: links saved with their text and topics, to list, read and put away from any chat. */
export const reading = defineModule(readingManifest, {
  tools: readingTools,
  prompt: {
    title: "Reading",
    tool: LINK,
    body:
      "The user has a reading inbox: links saved with their text and sorted by topic (the save_article, " +
      "list_articles, read_article and topic tools). When the user's whole message is a link and nothing else, " +
      `call ${LINK} with it instead of fetching it, and do what its result says. A link that comes with a ` +
      "question or an instruction is handled as usual."
  }
})
