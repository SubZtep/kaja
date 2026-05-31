import { debug, error, fatal, info, warn } from "@kaja/logger"
import { KAJA_CLI_CLIENT_ID } from "@kaja/schema"
import { type BetterAuthPlugin, betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin, bearer, deviceAuthorization, openAPI } from "better-auth/plugins"
import { db } from "../../core/db"
import { sendEmail } from "../../emails"
import type { EmailPayload } from "../../emails/template"

function deviceVerificationUrl() {
  const fromEnv = [process.env.WEB_PUBLIC_URL, process.env.CORS_ORIGIN].map(s => s?.trim()).find(Boolean)
  const base = (fromEnv ?? (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000")).replace(/\/$/, "")
  if (!base) {
    throw new Error("CORS_ORIGIN or WEB_PUBLIC_URL must be set for device authorization")
  }
  return new URL("/device", base).toString()
}

function sendAuthEmail(args: Parameters<typeof sendEmail>[0]) {
  // FIXME: Avoid awaiting the email sending to prevent timing attacks. (from Better-Auth doc)
  void sendEmail(args).catch(err => {
    // TODO: notify user somehow
    error("Failed to send auth email", {
      error: err,
      type: args.type,
      userId: args.payload.user.id,
      email: args.payload.user.email
    })
  })
}

const plugins: BetterAuthPlugin[] = [
  bearer(),
  admin(),
  deviceAuthorization({
    schema: {},
    verificationUri: deviceVerificationUrl(),
    validateClient: clientId => clientId === KAJA_CLI_CLIENT_ID,
    onDeviceAuthRequest: (clientId, scope) => {
      debug("Device authorization requested", { clientId, scope })
    }
  })
]

if (process.env.NODE_ENV === "development") {
  plugins.push(openAPI({ theme: "solarized" }))
}

export const auth = betterAuth({
  trustedOrigins: [process.env.CORS_ORIGIN],
  advanced: {
    cookiePrefix: "kaja",
    database: {
      generateId: () => Bun.randomUUIDv7(),
      defaultFindManyLimit: 1000
    },
    ...(process.env.CROSS_PARENT_DOMAIN
      ? {
          crossSubDomainCookies: {
            enabled: true,
            domain: process.env.CROSS_PARENT_DOMAIN
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
  database: drizzleAdapter(db, {
    provider: "pg"
  }),
  basePath: "/auth",
  plugins,
  logger: {
    log: (level, message, args) => {
      // Map Better Auth's logger calls to our new logger API
      const logFn = { trace: debug, debug, info, warn, error, fatal }[level]
      if (logFn) {
        logFn(message, args)
      }
    }
  },
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      sendAuthEmail({ type: "resetPassword", payload: { user, url } })
    }
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }: Readonly<EmailPayload>) => {
      const urlObj = new URL(url)
      urlObj.searchParams.set("callbackURL", new URL("/dashboard", process.env.CORS_ORIGIN).toString())
      sendAuthEmail({ type: "verification", payload: { user, url: urlObj.toString() } })
    },
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    expiresIn: 3600 * 24 // 1 day
  },
  user: {
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, url, newEmail }) => {
        sendAuthEmail({ type: "changeEmail", payload: { user, url, newEmail } })
      }
    }
  }
})
