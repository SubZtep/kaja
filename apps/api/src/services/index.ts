import { pool } from "../core/db"
import { McpServerService } from "./mcp-server"
import { ModelService } from "./model"
import { WidgetService } from "./widget"

export const mcpServerService = new McpServerService(pool)
export const modelService = new ModelService(pool)
export const widgetService = new WidgetService(pool)
