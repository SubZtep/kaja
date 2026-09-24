import * as z from "zod"
import { TaskSchema } from "./models"

// One model a provider serves, with the task it is used for.
const CatalogModelSchema = z.object({
  task: TaskSchema,
  // The name sent to the provider's API, e.g. "accounts/fireworks/models/minimax-m3".
  model: z.string().min(1)
})

// A provider the setup wizard knows how to configure.
const CatalogProviderSchema = z.object({
  // The [providers.<id>] key, and the name its API key goes under in secrets.toml.
  id: z.string().regex(/^[a-z0-9-]+$/),
  // How it is written on screen; a proper noun, so it is never translated.
  name: z.string().min(1),
  // hosted (someone else's server) is asked for an API key, self-hosted (the user's own server) for its address.
  kind: z.enum(["hosted", "self-hosted"]),
  base_url: z.url(),
  // Comment lines written above its [providers.<id>] table, without the leading "# ".
  comment: z.array(z.string()).optional(),
  // A trailing comment on its base_url line.
  note: z.string().optional(),
  // What it can serve, in the order they are offered.
  models: z.array(CatalogModelSchema).min(1)
})

/** The generated example that `kaja config fetch --offline` writes and the cloud seed loads. */
export const DEFAULT_MODELS_FILE = "models.default.toml"

// An example file in docs/config, generated from a mix of providers.
const CatalogExampleSchema = z.object({
  file: z.string().regex(/^models\.[a-z0-9-]+\.toml$/),
  // Written in catalog order whatever the order here, so a contested task goes to the provider listed first in the catalog.
  providers: z.array(z.string()).min(1),
  // Task to the provider that serves it instead, when the catalog order would pick another.
  pick: z.partialRecord(TaskSchema, z.string()).optional()
})

/** docs/config/catalog.toml: the one source of model defaults, for the setup wizard and the generated examples. */
export const CatalogFileSchema = z
  .object({
    providers: z.array(CatalogProviderSchema).min(1),
    examples: z.array(CatalogExampleSchema).default([])
  })
  .superRefine((data, ctx) => {
    const ids = new Set<string>()
    data.providers.forEach((provider, index) => {
      if (ids.has(provider.id))
        ctx.addIssue({
          code: "custom",
          path: ["providers", index, "id"],
          message: `Duplicate provider "${provider.id}"`
        })
      ids.add(provider.id)
    })
    if (!data.examples.some(example => example.file === DEFAULT_MODELS_FILE))
      ctx.addIssue({ code: "custom", path: ["examples"], message: `No example writes ${DEFAULT_MODELS_FILE}` })
    data.examples.forEach((example, index) => {
      for (const [task, id] of Object.entries(example.pick ?? {})) {
        if (!example.providers.includes(id))
          ctx.addIssue({
            code: "custom",
            path: ["examples", index, "pick", task],
            message: `"${id}" is not one of this example's providers`
          })
      }
      for (const id of example.providers) {
        if (!ids.has(id))
          ctx.addIssue({ code: "custom", path: ["examples", index, "providers"], message: `Unknown provider "${id}"` })
      }
    })
  })

export type CatalogFile = z.infer<typeof CatalogFileSchema>
