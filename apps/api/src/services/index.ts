import { pool } from "../core/db"
import { env } from "../core/env"
import { AbilityService } from "./ability"
import { MarketplaceService } from "./marketplace"
import { ModelService } from "./model"
import { SecretService } from "./secret"
import { StatsService } from "./stats"
import { TelegramLinkService } from "./telegram-link"
import { WidgetService } from "./widget"

export const marketplaceService = new MarketplaceService(pool, { repo: env.MARKETPLACE_REPO, ref: env.MARKETPLACE_REF })
export const modelService = new ModelService(pool)
export const secretService = new SecretService(pool, env.USER_SECRET_KEY)
export const abilityService = new AbilityService(pool, secretService)
export const statsService = new StatsService(pool)
export const telegramLinkService = new TelegramLinkService(pool)
export const widgetService = new WidgetService(pool)
