import { userImagePrefix } from "@kaja/nasi"
import { KAJA_TUI_CLIENT_ID } from "@kaja/schema/api"
import { locales } from "@kaja/shared/locale"
import { type BetterAuthPlugin, betterAuth } from "better-auth"
import { APIError, createAuthMiddleware, getOAuthState } from "better-auth/api"
import { admin, bearer, captcha, deviceAuthorization, emailOTP, openAPI } from "better-auth/plugins"
import { z } from "zod"
import { pool } from "../../core/db"
import { env } from "../../core/env"
import { objects } from "../../core/files"
import { isRateLimitEnabled } from "../../core/rate-limit"
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
    const userId = args.type === "signInCode" ? undefined : args.payload.user.id
    reportError("Failed to send auth email", err, { type: args.type, userId })
  })
}

/** The language a sign-in code email goes out in when the address has no account yet: the web sends its page locale as `Accept-Language`. */
function requestLocale(request: Request | undefined): string | undefined {
  return request?.headers.get("accept-language")?.split(/[,;]/)[0]?.trim()
}

/** True when a new account comes from the sign-up page with its consent boxes ticked: an email code sign-in's body, or a Google sign-up's OAuth state (the page passes both). */
async function signUpConsented(ctx: { path?: string; body?: unknown } | null | undefined): Promise<boolean> {
  if (ctx?.path === "/sign-in/email-otp") return (ctx.body as { consent?: unknown } | undefined)?.consent === true
  const state = await getOAuthState()
  return state?.requestSignUp === true && state.consent === true
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
  }),
  // Passwordless: an emailed code signs in, and creates the account when the sign-up page sent its consent.
  emailOTP({
    expiresIn: 600,
    storeOTP: "hashed",
    // Per IP, and many people share one; guessing is capped per code anyway (3 tries), and sending needs Turnstile.
    rateLimit: { window: 60, max: 20 },
    // Only sign-in codes are made (the before hook refuses other types), so this only ever sends those.
    sendVerificationOTP: async ({ email, otp }, ctx) => {
      const user = await ctx?.context.internalAdapter.findUserByEmail(email)
      const saved = user?.user as { name: string; locale?: string | null } | undefined
      sendAuthEmail({
        type: "signInCode",
        payload: { email, otp, name: saved?.name ?? "", locale: saved?.locale ?? requestLocale(ctx?.request) }
      })
    }
  })
]

if (env.NODE_ENV === "development") {
  plugins.push(openAPI({ theme: "purple" }))
}

// Turnstile gates the web's public auth forms and Google buttons (all send one "auth" action); tests run without it.
if (env.TURNSTILE_SECRET && !env.BUN_TEST) {
  // Cloudflare's test secrets (local runs) verify a dummy token that carries no action and the hostname "example.com".
  const testSecret = /^[123]x0+AA$/.test(env.TURNSTILE_SECRET)
  const allowedHostnames = (env.TURNSTILE_HOSTNAMES ?? "")
    .split(",")
    .map(hostname => hostname.trim())
    .filter(Boolean)
  if (allowedHostnames.length === 0 && !testSecret)
    throw new Error("TURNSTILE_HOSTNAMES must be set with TURNSTILE_SECRET")
  plugins.push(
    captcha({
      provider: "cloudflare-turnstile",
      secretKey: env.TURNSTILE_SECRET,
      endpoints: ["/email-otp/send-verification-otp", "/sign-in/social"],
      ...(testSecret ? {} : { expectedAction: "auth", allowedHostnames })
    })
  )
}

// The plugin's other code flows. Kaja never emails their codes, yet verify-email would sign in on a guessed one (autoSignInAfterVerification), so none of them is served.
const UNUSED_OTP_PATHS = [
  "/email-otp/check-verification-otp",
  "/email-otp/verify-email",
  "/email-otp/request-password-reset",
  "/email-otp/reset-password",
  "/forget-password/email-otp",
  "/email-otp/request-email-change",
  "/email-otp/change-email"
]

/** Prefix of Better Auth's cookies (`kaja.session_token`, or `__Secure-kaja.session_token` over HTTPS). */
export const AUTH_COOKIE_PREFIX = "kaja"

export const auth = betterAuth({
  trustedOrigins: [env.CORS_ORIGIN],
  // Top level, where Better Auth reads it (it sat under `advanced`, ignored). On in dev too, not only in production;
  // off under bun test and with RATE_LIMIT_ENABLED=false, like the API's own limiters.
  rateLimit: {
    enabled: isRateLimitEnabled(),
    window: 60, // time window in seconds
    max: 100 // max requests in the window
  },
  advanced: {
    cookiePrefix: AUTH_COOKIE_PREFIX,
    database: {
      generateId: () => Bun.randomUUIDv7(),
      defaultFindManyLimit: 1000
    },
    ipAddress: {
      ipv6Subnet: 56
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
  disabledPaths: UNUSED_OTP_PATHS,
  hooks: {
    // Another type's code would only sit unused, its endpoints being off
    before: createAuthMiddleware(async ctx => {
      if (ctx.path === "/email-otp/send-verification-otp" && ctx.body?.type !== "sign-in")
        throw new APIError("BAD_REQUEST", { message: "Only sign-in codes are sent" })
    }),
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
  databaseHooks: {
    user: {
      create: {
        // No account without the sign-up page's consent (18+, Terms and Privacy Policy, health data); the time is the consent record. The code tells the sign-in page the address has no account yet.
        before: async (user, ctx) => {
          if (!(await signUpConsented(ctx)))
            throw new APIError("BAD_REQUEST", { message: "Consent is required to sign up", code: "CONSENT_REQUIRED" })
          return { data: { ...user, consentedAt: new Date() } }
        }
      },
      // The rows cascade from the user; their images in object storage don't, so they go here (self-service and admin removal alike).
      delete: {
        after: async user => {
          await objects
            .deletePrefix(`${userImagePrefix(user.id)}/`)
            .catch(err => reportError("Failed to delete a removed user's images", err, { userId: user.id }))
        }
      }
    }
  },
  logger: {
    // Better Auth's own warnings and errors go to the container log.
    level: "warn",
    log: (level, message, ...args) => console[level === "error" ? "error" : "warn"](message, ...args)
  },
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        socialProviders: {
          // A new Google account only comes from the sign-up page (requestSignUp), where the consent boxes are.
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            disableImplicitSignUp: true
          }
        }
      }
    : {}),
  // Only an email change verifies an address by link now; a sign-in code proves the address itself.
  emailVerification: {
    sendVerificationEmail: async ({ user, url }: Readonly<EmailPayload>) => {
      const urlObj = new URL(url)
      urlObj.searchParams.set("callbackURL", new URL("/dashboard", env.CORS_ORIGIN).toString())
      sendAuthEmail({ type: "verification", payload: { user, url: urlObj.toString() } })
    },
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
    additionalFields: {
      consentedAt: { type: "date", required: false, input: false, fieldName: "consented_at" },
      // Better Auth doesn't check an enum type's values on input, so the validator does.
      locale: { type: [...locales], required: false, validator: { input: z.enum(locales) } }
    },
    // Self-service deletion from the profile page; needs a recent sign-in. Everything the user owns cascades from the user row, and the delete hook above removes their images.
    deleteUser: { enabled: true },
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, url, newEmail }) => {
        sendAuthEmail({ type: "changeEmail", payload: { user, url, newEmail } })
      }
    }
  }
})
