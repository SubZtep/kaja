import { KAJA_TUI_CLIENT_ID } from "@kaja/schema/api"
import { type BetterAuthPlugin, betterAuth } from "better-auth"
import { createAuthMiddleware } from "better-auth/api"
import { admin, bearer, deviceAuthorization, openAPI } from "better-auth/plugins"
import { pool } from "../../core/db"
import { env } from "../../core/env"
import { reportError } from "../../core/report"
import { sendEmail } from "../../emails"
import type { EmailPayload } from "../../emails/template"
import { blankProfileFields, googleProfileFromIdToken } from "./google-profile"

function deviceVerificationUrl() {
  const fromEnv = [env.WEB_PUBLIC_URL, env.CORS_ORIGIN].find(Boolean)
  const base = (fromEnv ?? (env.NODE_ENV === "production" ? "" : "http://localhost:3000")).replace(/\/$/, "")
  if (!base) {
    throw new Error("CORS_ORIGIN or WEB_PUBLIC_URL must be set for device authorization")
  }
  return new URL("/device", base).toString()
}

/**
 * Fire-and-forget email send (Better Auth: do not await — avoids timing leaks).
 * Failures are logged for ops; the user already got a success response from the auth action.
 * Re-delivery / in-app banners can be layered on later without blocking the request path.
 */
function sendAuthEmail(args: Parameters<typeof sendEmail>[0]) {
  void sendEmail(args).catch(err => {
    reportError("Failed to send auth email", err, { type: args.type, userId: args.payload.user.id })
  })
}

// Better Auth names its columns in camelCase; the database keeps snake_case like every other table, so each field is mapped here.
const timestamps = { createdAt: "created_at", updatedAt: "updated_at" }

const plugins: BetterAuthPlugin[] = [
  bearer(),
  admin({
    schema: {
      user: { fields: { banReason: "ban_reason", banExpires: "ban_expires" } },
      session: { fields: { impersonatedBy: "impersonated_by" } }
    }
  }),
  deviceAuthorization({
    schema: {
      deviceCode: {
        modelName: "device_code",
        fields: {
          deviceCode: "device_code",
          userCode: "user_code",
          userId: "user_id",
          clientId: "client_id",
          expiresAt: "expires_at",
          lastPolledAt: "last_polled_at",
          pollingInterval: "polling_interval"
        }
      }
    },
    verificationUri: deviceVerificationUrl(),
    validateClient: clientId => clientId === KAJA_TUI_CLIENT_ID
  })
]

if (env.NODE_ENV === "development") {
  plugins.push(openAPI({ theme: "purple" }))
}

export const auth = betterAuth({
  trustedOrigins: [env.CORS_ORIGIN],
  advanced: {
    cookiePrefix: "kaja",
    database: {
      generateId: () => Bun.randomUUIDv7(),
      defaultFindManyLimit: 1000
    },
    ipAddress: {
      ipv6Subnet: 56
    },
    rateLimit: {
      enabled: true, // enable in dev mode too
      window: 60, // time window in seconds
      max: 100 // max requests in the window
    },
    ...(env.CROSS_PARENT_DOMAIN
      ? {
          crossSubDomainCookies: {
            enabled: true,
            domain: env.CROSS_PARENT_DOMAIN
          },
          cookies: {
            session_token: {
              attributes: {
                sameSite: "none",
                secure: true,
                httpOnly: true,
                path: "/"
              }
            }
          }
        }
      : {})
  },
  database: pool,
  basePath: "/auth",
  plugins,
  hooks: {
    // A Google sign-in fills a blank name or avatar (say, an email account that linked Google) but never overwrites what the user set.
    after: createAuthMiddleware(async ctx => {
      if (ctx.path !== "/callback/:id" || ctx.params?.id !== "google") return
      const user = ctx.context.newSession?.user
      if (!user) return
      const accounts = await ctx.context.internalAdapter.findAccounts(user.id)
      const google = accounts.find(account => account.providerId === "google")
      const fill = blankProfileFields(user, googleProfileFromIdToken(google?.idToken))
      if (Object.keys(fill).length > 0) await ctx.context.internalAdapter.updateUser(user.id, fill)
    })
  },
  logger: {
    // Better Auth's own warnings and errors go to the container log.
    level: "warn",
    log: (level, message, ...args) => console[level === "error" ? "error" : "warn"](message, ...args)
  },
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        socialProviders: {
          google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
        }
      }
    : {}),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      sendAuthEmail({ type: "resetPassword", payload: { user, url } })
    }
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }: Readonly<EmailPayload>) => {
      const urlObj = new URL(url)
      urlObj.searchParams.set("callbackURL", new URL("/dashboard", env.CORS_ORIGIN).toString())
      sendAuthEmail({ type: "verification", payload: { user, url: urlObj.toString() } })
    },
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 3600 * 24 // 1 day
  },
  session: {
    fields: {
      expiresAt: "expires_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      userId: "user_id",
      ...timestamps
    }
  },
  account: {
    fields: {
      accountId: "account_id",
      providerId: "provider_id",
      userId: "user_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      ...timestamps
    },
    // Google verifies emails, so a Google sign-in links to the existing account with the same (verified) email
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? { accountLinking: { enabled: true, trustedProviders: ["google"] } }
      : {})
  },
  verification: {
    fields: { expiresAt: "expires_at", ...timestamps }
  },
  user: {
    fields: { emailVerified: "email_verified", ...timestamps },
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, url, newEmail }) => {
        sendAuthEmail({ type: "changeEmail", payload: { user, url, newEmail } })
      }
    }
  }
})
