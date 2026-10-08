import { parseMarketplaceSources } from "@kaja/nasi"
import { pool } from "../core/db"
import { env } from "../core/env"
import { AbilityService, parseAbilityKeys } from "./ability"
import { MarketplaceService } from "./marketplace"
import { ModelService } from "./model"
import { SandboxService } from "./sandbox"
import { SecretService } from "./secret"
import { StatsService } from "./stats"
import { TelegramLinkService } from "./telegram-link"
import { WidgetService } from "./widget"

export const marketplaceService = new MarketplaceService(pool, parseMarketplaceSources(env.MARKETPLACE_SOURCES), {
  token: env.MARKETPLACE_GITHUB_TOKEN
})
export const modelService = new ModelService(pool)
export const secretService = new SecretService(pool, env.USER_SECRET_KEY)
export const abilityService = new AbilityService(pool, secretService, parseAbilityKeys(env.ABILITY_KEYS))
export const sandboxService = new SandboxService(pool)
export const statsService = new StatsService(pool)
export const telegramLinkService = new TelegramLinkService(pool)
export const widgetService = new WidgetService(pool)
