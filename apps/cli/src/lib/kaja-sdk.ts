// import { hostname } from "node:os"
import { join } from "node:path"
import { getCurrentIp } from "@kaja/geo"
import type { ConnectNodeRequest, ConnectNodeResponse, HeartbeatRequest, HeartbeatResponse } from "@kaja/schemas"
import { type Config, configSchema } from "@kaja/schemas"
import envPaths from "env-paths"
import { logger } from "./logger"
import { getAccessToken } from "./token"

// const DEFAULT_NODE_NAME = hostname()

export class KajaClient {
  // config: Config = { name: DEFAULT_NODE_NAME }
  readonly baseURL: string
  nodeId?: string
  ip?: string

  constructor(options: { baseURL: string; nodeId?: string }) {
    this.baseURL = options.baseURL
    this.nodeId = options.nodeId
    // getConfig().then(config => (this.config = config))
    getCurrentIp().then(ip => (this.ip = ip))
  }

  async connectNode(payload?: ConnectNodeRequest) {
    try {
      const res = await this.#apiRequest<ConnectNodeResponse>("/kaja/connect", {
        ...(payload ?? this.config),
        ip: this.ip
      })
      this.nodeId = res.nodeId
    } catch (error) {
      throw new Error(`Error connecting node: ${error instanceof Error ? error.message : String(error)}`)
    }
    return this.nodeId
  }

  async heartbeat(payload: HeartbeatRequest): Promise<HeartbeatResponse | null> {
    try {
      return await this.#apiRequest<HeartbeatResponse>("/kaja/heartbeat", payload)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`Heartbeat failed: ${message}`)
      return null
    }
  }

  async ping() {
    const url = new URL("/health", this.baseURL).toString()
    const res = await fetch(url)
    return res.ok
  }

  setConfig(config: Partial<Config>) {
    const { success, error } = configSchema.safeParse(config)
    if (!success) {
      console.log(`Config is invalid: ${error.message}`)
      return false
    }

    this.config = { ...this.config, ...config }
    return true
  }

  // get host() {
  //   try {
  //     return new URL(this.baseURL).host
  //   } catch (error: unknown) {
  //     throw new Error(`Error getting host: ${error instanceof Error ? error.message : String(error)}`)
  //   }
  // }

  // MARK: Request

  async #apiRequest<T = unknown>(path: string, payload?: unknown, options?: RequestInit): Promise<T> {
    const url = new URL(path, this.baseURL).toString()
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
}

// MARK: Config

export function getConfigFullPath() {
  const paths = envPaths("kaja", { suffix: "" })
  return join(paths.config, "config.json")
}

// export async function getConfig(): Promise<Config> {
//   const EMPTY_CONFIG = { id: undefined, name: "" } as const
//   const path = getConfigFullPath()
//   const f = Bun.file(path)

//   if (!(await f.exists())) {
//     return EMPTY_CONFIG
//   }

//   try {
//     const conf = await f.text()
//     return configSchema.parse(JSON.parse(conf))
//   } catch (error: unknown) {
//     logger.error({ error, path }, "Invalid config file")
//     return EMPTY_CONFIG
//   }
// }

// export async function setConfig(config: Config) {
//   const { success, error } = configSchema.safeParse(config)
//   if (!success) {
//     logger.error({ error, config }, "Config is invalid")
//     return false
//   }
//   const fullPath = getConfigFullPath()
//   try {
//     await Bun.write(fullPath, JSON.stringify(config, null, 2))
//   } catch (error: unknown) {
//     logger.error({ error, fullPath, config }, "Failed to write config file")
//     return false
//   }
//   return true
// }

// export async function deleteConfig() {
//   const fullPath = getConfigFullPath()
//   try {
//     await Bun.file(fullPath).delete()
//   } catch (error: unknown) {
//     logger.error({ error, fullPath }, "Failed to delete config file")
//     return false
//   }
//   return true
// }
