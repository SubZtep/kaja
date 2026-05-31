import type { OpenAPIHono } from "@hono/zod-openapi"
import type { CommandService } from "./features/kaja/services/command"
import type { NodeService } from "./features/kaja/services/node"

declare module "bun" {
  interface Env {
    /** Generate: `openssl rand -base64 32` */
    BETTER_AUTH_SECRET?: string
    /** This API’s base URL. */
    BETTER_AUTH_URL: string
    /** @default 3001 */
    PORT?: string
    CORS_ORIGIN: string
    /** Set base domain when apps live on subdomains (e.g. ondis.co) */
    CROSS_PARENT_DOMAIN?: string
    DATABASE_URL: string
    GEOIP_ACCOUNT_ID: string
    GEOIP_LICENSE_KEY: string
    /** @default /usr/share/GeoIP/GeoLite2-City.mmdb */
    GEOIP_DB_PATH?: string
    SMTP_HOST: string
    SMTP_PORT: string
    /** Set to `true`, `1`, or any value interpreted as boolean true. */
    SMTP_SECURE?: string
    SMTP_USER?: string
    SMTP_PASS?: string
    /** Public web URL for device-auth verification (defaults to CORS_ORIGIN) */
    WEB_PUBLIC_URL?: string
  }
}

// user type from better-auth session
export type AuthSessionUser = {
  id: string
  email: string
  name?: string
}

// context variables for Hono
export type RouteVariables = {
  user: AuthSessionUser | null
  nodeService: NodeService
  commandService: CommandService
}

/** common route properties. */
export type RouteProps = { Variables: RouteVariables }

/** Register functions properties for route register helpers. */
export type RouteRegProps = OpenAPIHono<RouteProps>
