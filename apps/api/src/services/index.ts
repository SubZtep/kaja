import { pool } from "../core/db"
import { McpServerService } from "./mcp-server"
import { ModelService } from "./model"
import { PersonaService } from "./persona"
import { WidgetKeyService } from "./widget-key"

export const mcpServerService = new McpServerService(pool)
export const modelService = new ModelService(pool)
export const personaService = new PersonaService(pool)
export const widgetKeyService = new WidgetKeyService(pool)
