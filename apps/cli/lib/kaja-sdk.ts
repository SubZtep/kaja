import type { HeartbeatRequest, HeartbeatResponse, SpawnNodeRequest, SpawnNodeResponse } from "@kaja/schemas"
import { resolveApiUrl } from "./config"
import { getAccessToken } from "./token"

export interface KajaClientOptions {
  baseURL?: string
  nodeId?: string
}

export class KajaClient {
  readonly baseURL: string
  nodeId?: string

  constructor(options?: KajaClientOptions) {
    this.baseURL = options?.baseURL ?? resolveApiUrl()
    this.nodeId = options?.nodeId
  }

  /** Apply for jobs */
  async spawnNode(payload: SpawnNodeRequest) {
    try {
      const res = await this.#apiRequest<SpawnNodeResponse>("/kaja/spawn-node", payload)
      this.nodeId = res.nodeId
    } catch (error: unknown) {
      throw new Error(`Error spawning node: ${this.#errorMessage(error)}`)
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
    const res = await fetch(this.#buildUrl("/health"))
    return res.ok
  }

  get host() {
    try {
      return new URL(this.baseURL).host
    } catch (error: unknown) {
      throw new Error(`Error getting host: ${this.#errorMessage(error)}`)
    }
  }

  async #apiRequest<T = unknown>(path: string, payload?: unknown, options?: RequestInit) {
    const { headers: initHeaders, ...rest } = options ?? {}
    const headers = new Headers(initHeaders)
    headers.set("Content-Type", "application/json")
    const token = await getAccessToken()
    if (token) {
      headers.set("Authorization", `Bearer ${token}`)
    }
    const response = await fetch(this.#buildUrl(path), {
      method: "POST",
      headers,
      body: payload ? JSON.stringify(payload) : undefined,
      ...rest
    })

    if (!response.ok) {
      throw new Error(`${response.statusText} around ${path} 🤮`)
    }

    return (await response.json()) as T
  }

  #buildUrl(path: string) {
    return new URL(path, this.baseURL).toString()
  }

  #errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
  }
}
