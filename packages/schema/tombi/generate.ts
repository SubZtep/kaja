import { join } from "node:path"
import { write } from "bun"
import { tombiSchemas } from "./index"

/** Regenerates config/schemas/*.json from tombiSchemas. Run after changing any config/ or cli/ schema. */
const outDir = join(import.meta.dir, "..", "..", "..", "config", "schemas")

await Promise.all(
  Object.entries(tombiSchemas).map(([filename, schema]) =>
    write(join(outDir, filename), `${JSON.stringify(schema, null, 2)}\n`)
  )
)

console.log(`Wrote ${Object.keys(tombiSchemas).length} schema files to ${outDir}`)
