import { error } from "@kaja/logger"
import type {
  Command,
  ConnectNodeRequest,
  ConnectNodeResponse,
  CreateCommandRequest,
  DisconnectNodeRequest,
  HeartbeatRequest,
  HeartbeatResponse,
  ListNodesResponse
} from "@kaja/schema"
import {
  commandSchema,
  connectNodeResponseSchema,
  heartbeatResponseSchema,
  listNodesResponseSchema
} from "@kaja/schema"
import { z } from "zod"

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

  commands = {
    create: async (nodeId: string, payload: CreateCommandRequest): Promise<Command> => {
      const response = await this.#request(`/admin/nodes/${nodeId}/commands`, payload)
      return commandSchema.parse(response)
    },
    list: async (nodeId: string): Promise<Command[]> => {
      const response = await this.#request<{ commands: Command[] }>(`/admin/nodes/${nodeId}/commands`)
      return z.array(commandSchema).parse(response.commands)
    },
    cancel: async (commandId: string): Promise<Command> => {
      const response = await this.#request(`/admin/commands/${commandId}/cancel`, {})
      return commandSchema.parse(response)
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
      } catch (err) {
        error("API request error", { error: err })
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
      error("API requiest failed", { path, response })
      throw new Error(response.statusText)
    }

    return response.json()
  }
}
