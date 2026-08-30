import { createRoute, z } from "@hono/zod-openapi"
import {
  createPersonaRequestSchema,
  listPersonasResponseSchema,
  personaSchema,
  updatePersonaRequestSchema
} from "@kaja/schema/api"
import type { RouteRegProps } from "../../types"
import { notFound, unauthorized } from "../../types/errors"

const errorSchema = z.object({ error: z.string() })
const idParam = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" }, example: "01945678-1234-7abc-9def-0123456789ab" })
})

const listPersonasRoute = createRoute({
  method: "get",
  path: "/personas",
  tags: ["Admin"],
  summary: "List all personas",
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: "List of personas", content: { "application/json": { schema: listPersonasResponseSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } }
  }
})

const createPersonaRoute = createRoute({
  method: "post",
  path: "/personas",
  tags: ["Admin"],
  summary: "Create a persona",
  security: [{ bearerAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: createPersonaRequestSchema } } }
  },
  responses: {
    201: { description: "Persona created successfully", content: { "application/json": { schema: personaSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } }
  }
})

const updatePersonaRoute = createRoute({
  method: "patch",
  path: "/personas/{id}",
  tags: ["Admin"],
  summary: "Update a persona",
  security: [{ bearerAuth: [] }],
  request: {
    params: idParam,
    body: { content: { "application/json": { schema: updatePersonaRequestSchema } } }
  },
  responses: {
    200: { description: "Persona updated successfully", content: { "application/json": { schema: personaSchema } } },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Persona not found", content: { "application/json": { schema: errorSchema } } }
  }
})

const deletePersonaRoute = createRoute({
  method: "delete",
  path: "/personas/{id}",
  tags: ["Admin"],
  summary: "Delete a persona",
  security: [{ bearerAuth: [] }],
  request: { params: idParam },
  responses: {
    200: {
      description: "Persona deleted successfully",
      content: { "application/json": { schema: z.object({ success: z.boolean() }) } }
    },
    401: { description: "Unauthorized", content: { "application/json": { schema: errorSchema } } },
    403: { description: "Forbidden", content: { "application/json": { schema: errorSchema } } },
    404: { description: "Persona not found", content: { "application/json": { schema: errorSchema } } }
  }
})

export function registerAdminPersonas(app: RouteRegProps) {
  app.openapi(listPersonasRoute, async c => {
    const user = c.get("user")
    if (!user) return unauthorized(c)

    const personaService = c.get("personaService")
    const personas = await personaService.listPersonas()
    return c.json({ personas })
  })

  app.openapi(createPersonaRoute, async c => {
    const user = c.get("user")
    if (!user) return unauthorized(c)

    const body = c.req.valid("json")
    const personaService = c.get("personaService")
    const persona = await personaService.createPersona(body)
    return c.json(persona, 201)
  })

  app.openapi(updatePersonaRoute, async c => {
    const user = c.get("user")
    if (!user) return unauthorized(c)

    const { id } = c.req.valid("param")
    const body = c.req.valid("json")
    const personaService = c.get("personaService")
    const persona = await personaService.updatePersona(id, body)
    if (!persona) return notFound(c, "Persona not found")
    return c.json(persona)
  })

  app.openapi(deletePersonaRoute, async c => {
    const user = c.get("user")
    if (!user) return unauthorized(c)

    const { id } = c.req.valid("param")
    const personaService = c.get("personaService")
    const success = await personaService.deletePersona(id)
    if (!success) return notFound(c, "Persona not found")
    return c.json({ success })
  })
}
