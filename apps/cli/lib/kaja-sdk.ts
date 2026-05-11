import { join } from "node:path"
import { stringify as tomlStringify } from "@iarna/toml"
import { getCurrentIp } from "@kaja/geo"
import type { HeartbeatRequest, HeartbeatResponse, SpawnNodeRequest, SpawnNodeResponse } from "@kaja/schemas"
import { type Config, configSchema } from "@kaja/schemas"
import envPaths from "env-paths"
import { DEFAULT_NODE_NAME } from "./constants"
import { getAccessToken } from "./token"

export class KajaClient {
  config: Config = { name: DEFAULT_NODE_NAME }
  readonly baseURL: string
  nodeId?: string
  ip?: string

  constructor(options: { baseURL: string; nodeId?: string }) {
    this.baseURL = options.baseURL
    this.nodeId = options.nodeId
    getConfig().then(config => (this.config = config))
    getCurrentIp().then(ip => (this.ip = ip))
  }

  async spawnNode(payload?: SpawnNodeRequest) {
    try {
      const res = await this.#apiRequest<SpawnNodeResponse>("/kaja/spawn-node", {
        ...(payload ?? this.config),
        ip: this.ip
      })
      this.nodeId = res.nodeId
    } catch (error: unknown) {
      throw new Error(`Error spawning node: ${error instanceof Error ? error.message : String(error)}`)
    }
    return this.nodeId
  }

  async heartbeat(payload: HeartbeatRequest) {
    try {
      return (await this.#apiRequest<HeartbeatResponse>("/kaja/heartbeat", payload)).ok
    } catch {
      return false
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

  get host() {
    try {
      return new URL(this.baseURL).host
    } catch (error: unknown) {
      throw new Error(`Error getting host: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

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
      console.error(path, response)
      throw new Error(response.statusText)
    }

    return response.json()
  }
}

// MARK: Config

function getConfigPath() {
  const paths = envPaths("kaja", { suffix: "" })
  return join(paths.config, "config.toml")
}

export async function getConfig(): Promise<Config> {
  const path = getConfigPath()
  const f = Bun.file(path)

  if (!(await f.exists())) {
    return {
      id: undefined,
      name: DEFAULT_NODE_NAME
    }
  }

  try {
    const toml = await f.text()
    const res = Bun.TOML.parse(toml)
    return configSchema.parse(res)
  } catch (error: any) {
    console.log(`Config file is invalid: ${error.message}`)
    return {
      id: undefined,
      name: DEFAULT_NODE_NAME
    }
  }
}

export async function setConfig(config: Config) {
  const { success, error } = configSchema.safeParse(config)
  if (!success) {
    console.log(`Config is invalid: ${error.message}`)
    return false
  }

  const toml = tomlStringify(config)
  const path = getConfigPath()

  try {
    await Bun.write(path, toml)
  } catch (error: any) {
    console.log(`Failed to write config file: ${error.message}`)
    return false
  }

  return true
}

export async function deleteConfig() {
  const path = getConfigPath()
  try {
    await Bun.file(path).delete()
  } catch (error: any) {
    console.log(`Failed to delete config file: ${error.message}`)
    return false
  }
  return true
}
