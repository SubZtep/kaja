import { sql } from "../core/db"
import { env } from "../core/env"
import { AbilityService } from "./ability"
import { ImageService } from "./image"
import { MarketplaceService } from "./marketplace"
import { ModelService } from "./model"
import { SandboxService } from "./sandbox"
import { SecretService } from "./secret"
import { StatsService } from "./stats"
import { TelegramLinkService } from "./telegram-link"
import { WidgetService } from "./widget"

export const marketplaceService = new MarketplaceService(sql, { repo: env.MARKETPLACE_REPO, ref: env.MARKETPLACE_REF })
export const modelService = new ModelService(sql)
export const secretService = new SecretService(sql, env.USER_SECRET_KEY)
export const abilityService = new AbilityService(sql, secretService)
export const imageService = new ImageService(sql)
export const sandboxService = new SandboxService(sql)
export const statsService = new StatsService(sql)
export const telegramLinkService = new TelegramLinkService(sql)
export const widgetService = new WidgetService(sql)
