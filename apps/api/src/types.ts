import type { OpenAPIHono } from "@hono/zod-openapi"
import type { CommandService } from "./features/kaja/services/command"
import type { NodeService } from "./features/kaja/services/node"

declare module "bun" {
  interface Env {
    PORT: string
    CORS_ORIGIN: string
    /** Public web URL for device-auth verification (defaults to CORS_ORIGIN) */
    WEB_PUBLIC_URL?: string
    /** Set base domain when apps live on subdomains (e.g. ondis.co) */
    CROSS_PARENT_DOMAIN?: string
    DATABASE_URL: string
    BETTER_AUTH_URL: string
    BETTER_AUTH_SECRET: string
    EMAIL_FROM: string
    SMTP_HOST: string
    SMTP_PORT: string
    /** Set to `true`, `1`, or any value interpreted as boolean true. */
    SMTP_SECURE: string
    SMTP_USER: string
    SMTP_PASS: string
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
