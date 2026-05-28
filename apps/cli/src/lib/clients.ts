import { z } from "zod"

declare module "bun" {
  interface Env {
    /** API base URL without trailing slash */
    API_URL: string
  }
}

export const apiBaseUrl = resolveApiUrl()

///////

const optionalTrimmedStringSchema = z.preprocess(value => {
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}, z.string().optional())

export function resolveApiUrl() {
  const url = pickApiUrl({
    argApiUrl: readArgValue("--api-url"),
    // envApiUrl: optionalTrimmedStringSchema.parse(process.env.API_URL),
    envApiUrl: process.env.API_URL,
    configApiUrl: process.env.NODE_ENV === "development" ? "http://localhost:3001" : "https://api.kaja.io"
  })
  if (!url) {
    throw new Error("API URL is not defined.")
  }
  return url
}

export function pickApiUrl(input: { argApiUrl?: string; envApiUrl?: string; configApiUrl?: string }) {
  return input.argApiUrl ?? input.envApiUrl ?? input.configApiUrl
}

function readArgValue(flag: string) {
  const args = process.argv.slice(2)

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === flag) {
      return optionalTrimmedStringSchema.parse(args[i + 1])
    }

    const withValuePrefix = `${flag}=`
    if (arg.startsWith(withValuePrefix)) {
      return optionalTrimmedStringSchema.parse(arg.slice(withValuePrefix.length))
    }
  }

  return undefined
}
