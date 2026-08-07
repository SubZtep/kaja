import { join } from "node:path"
import { write } from "bun"
import * as z from "zod"
import { KajaConfigSchema } from "./config"

const jsonSchema = z.toJSONSchema(KajaConfigSchema)
const outPath = join(import.meta.dir, "../../../docs/config/settings.schema.json")
await write(outPath, `${JSON.stringify(jsonSchema, null, 2)}\n`)
