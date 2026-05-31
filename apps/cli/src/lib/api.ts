import type {
  ConnectNodeRequest,
  ConnectNodeResponse,
  DisconnectNodeRequest,
  HeartbeatRequest,
  HeartbeatResponse
} from "@kaja/schemas"
import { connectNodeResponseSchema, heartbeatResponseSchema } from "@kaja/schemas"
import { z } from "zod"
import { logger } from "./logger"
import { getAccessToken } from "./token"

export async function connectNodeRequest(payload: ConnectNodeRequest) {
  try {
    const res = await request<ConnectNodeResponse>("/nodes/connect", payload)
    return connectNodeResponseSchema.parse(res)
  } catch (error) {
    logger.error({ error }, "Error connecting node")
    throw new Error("Error connecting node")
  }
}

export async function disconnectNodeRequest(payload: DisconnectNodeRequest) {
  try {
    const res = await request<{ success: boolean }>("/nodes/disconnect", payload)
    return res
  } catch (error) {
    logger.error({ error }, "Error disconnecting node")
    throw error
  }
}

export async function sendHeartbeat(payload: HeartbeatRequest, signal?: AbortSignal) {
  try {
    const res = await request<HeartbeatResponse>("/nodes/heartbeat", payload, { signal })
    return heartbeatResponseSchema.parse(res)
  } catch (error) {
    throw new Error(`Error sending heartbeat: ${error instanceof Error ? error.message : String(error)}`)
  }
}

// MARK: API Helpers

async function request<T = Response>(path: string, payload?: unknown, options?: RequestInit): Promise<T> {
  const url = new URL(path, apiBaseUrl).toString()
  const { headers: initHeaders, ...rest } = options ?? {}
  const headers = new Headers(initHeaders)
  headers.set("Content-Type", "application/json")
  const token = await getAccessToken()
  if (token) {
    headers.set("Authorization", `Bearer ${token}`)
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: payload ? JSON.stringify(payload) : undefined,
    ...rest
  })

  if (!response.ok) {
    logger.error({ path, response }, "API request failed")
    throw new Error(response.statusText)
  }

  return response.json()
}

export const apiBaseUrl = resolveApiUrl()

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

const optionalTrimmedStringSchema = z.preprocess(value => {
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}, z.string().optional())

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
