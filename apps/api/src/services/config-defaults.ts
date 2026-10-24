import { tombiSchemas } from "@kaja/schema/tombi"

/**
 * JSON Schemas for the TOML files (`settings.json`, `models.json`, ...), derived from the runtime validators, so they
 * match this build.
 */
export const defaultSchemas: ReadonlyMap<string, object> = new Map(Object.entries(tombiSchemas))
