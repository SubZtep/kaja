import { pool } from "../core/db"
import { env } from "../core/env"
import { MarketplaceService } from "./marketplace"
import { McpServerService } from "./mcp-server"
import { ModelService } from "./model"
import { PackageService } from "./package"
import { SecretService } from "./secret"
import { TelegramLinkService } from "./telegram-link"
import { WidgetService } from "./widget"

export const mcpServerService = new McpServerService(pool)
export const marketplaceService = new MarketplaceService(pool, { repo: env.MARKETPLACE_REPO, ref: env.MARKETPLACE_REF })
export const modelService = new ModelService(pool)
export const secretService = new SecretService(pool, env.USER_SECRET_KEY)
export const packageService = new PackageService(pool, secretService)
export const telegramLinkService = new TelegramLinkService(pool)
export const widgetService = new WidgetService(pool)
