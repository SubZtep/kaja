import { defineModule } from "../contract"
import { readingManifest } from "./manifest"
import { readingTools } from "./tools"

/** A reading inbox: links saved with their text, to list, read and put away from any chat. */
export const reading = defineModule(readingManifest, { tools: readingTools })
