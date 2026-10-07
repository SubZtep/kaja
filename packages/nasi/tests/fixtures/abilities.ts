import { type HttpToolAbility, HttpToolAbilitySchema, type McpAbility, McpAbilitySchema } from "@kaja/schema/abilities"
import type * as z from "zod"

/** An HTTP tool ability as a store returns it: the parsed `tool.toml` plus its folder's name. */
export const httpAbility = ({
  name,
  ...input
}: { name: string } & z.input<typeof HttpToolAbilitySchema>): HttpToolAbility => ({
  ...HttpToolAbilitySchema.parse(input),
  name
})

/** An MCP ability as a store returns it: the parsed `mcp.toml` plus its folder's name. */
export const mcpAbility = ({ name, ...input }: { name: string } & z.input<typeof McpAbilitySchema>): McpAbility => ({
  ...McpAbilitySchema.parse(input),
  name
})
