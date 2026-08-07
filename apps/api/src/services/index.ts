import { pool } from "../core/db"
import { McpServerService } from "./mcp-server"
import { ModelService } from "./model"

export const mcpServerService = new McpServerService(pool)
export const modelService = new ModelService(pool)
