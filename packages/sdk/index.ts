import type {
  ConnectNodeRequest,
  ConnectNodeResponse,
  DisconnectNodeRequest,
  HeartbeatRequest,
  HeartbeatResponse,
  ListNodesResponse
} from "@kaja/schemas"
import { connectNodeResponseSchema, heartbeatResponseSchema, listNodesResponseSchema } from "@kaja/schemas"

export class KajaAPI {
  /** API base URL. */
  baseUrl: string
  #getAccessToken: () => Promise<string | null>

  constructor({ baseUrl, getAccessToken }: { baseUrl: string; getAccessToken: () => Promise<string | null> }) {
    this.baseUrl = baseUrl
    this.#getAccessToken = getAccessToken
  }

  nodes = {
    list: async (): Promise<ListNodesResponse> => {
      const response = await this.#request("/nodes")
      return listNodesResponseSchema.parse(response)
    },
    connect: async (payload: ConnectNodeRequest): Promise<ConnectNodeResponse> => {
      const response = await this.#request("/nodes/connect", payload)
      return connectNodeResponseSchema.parse(response)
    },
    disconnect: async (payload: DisconnectNodeRequest) => {
      return this.#request<{ success: boolean }>("/nodes/disconnect", payload)
    },
    heartbeat: async (payload: HeartbeatRequest, options?: RequestInit): Promise<HeartbeatResponse> => {
      const response = await this.#request("/nodes/heartbeat", payload, options)
      return heartbeatResponseSchema.parse(response)
    }
  }

  async #request<T = Response>(path: string, payload?: unknown, options?: RequestInit): Promise<T> {
    const url = new URL(path, this.baseUrl).toString()
    const { headers: initHeaders, ...rest } = options ?? {}
    const headers = new Headers(initHeaders)
    headers.set("Content-Type", "application/json")
    const token = await this.#getAccessToken()
    if (token) {
      headers.set("Authorization", `Bearer ${token}`)
    }

    let body: BodyInit | undefined
    if (payload) {
      try {
        body = JSON.stringify(payload)
      } catch (error) {
        console.log("API request error", error)
      }
    }

    const response = await fetch(url, {
      credentials: "include",
      method: payload === undefined ? "GET" : "POST",
      headers,
      body,
      ...rest
    })

    if (!response.ok) {
      console.error("API requiest failed", { path, response })
      // logger.error({ path, response }, "API request failed")
      throw new Error(response.statusText)
    }

    return response.json()
  }
}
