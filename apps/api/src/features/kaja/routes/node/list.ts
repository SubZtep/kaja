import type { RouteRegProps } from "#/types"

export function registerList(app: RouteRegProps) {
  app.get("/nodes", async c => {
    const user = c.get("user")
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401)
    }

    const nodeService = c.get("nodeService")
    const nodes = await nodeService.getActiveNodes(user.id)

    return c.json({ nodes })
  })
}
