import { error } from "@kaja/logger"
import type {
  Command,
  ConnectNodeRequest,
  ConnectNodeResponse,
  CreateCommandRequest,
  CreateMcpServerRequest,
  CreateModelRequest,
  CreateProviderRequest,
  DisconnectNodeRequest,
  HeartbeatRequest,
  HeartbeatResponse,
  ListMcpServersResponse,
  ListModelsResponse,
  ListNodesResponse,
  ListProvidersResponse,
  McpServer,
  Model,
  Provider,
  UpdateMcpServerRequest,
  UpdateModelRequest,
  UpdateProviderRequest
} from "@kaja/schema"
import {
  commandSchema,
  connectNodeResponseSchema,
  heartbeatResponseSchema,
  listNodesResponseSchema,
  mcpServerSchema,
  modelSchema,
  providerSchema
} from "@kaja/schema"
import { z } from "zod"

export class KajaAPI {
  /** API base URL. */
  readonly baseUrl: string
  readonly #getAccessToken: () => Promise<string | null>

  constructor({ baseUrl, getAccessToken }: { baseUrl: string; getAccessToken: () => Promise<string | null> }) {
    this.baseUrl = baseUrl
    this.#getAccessToken = getAccessToken
  }

  /** Get access token (for CLI EventSource connections) */
  async getToken(): Promise<string | null> {
    return this.#getAccessToken()
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
    },
    commands: {
      start: async (nodeId: string, commandId: string): Promise<Command> => {
        const response = await this.#request(`/nodes/${nodeId}/commands/${commandId}/start`, {})
        return commandSchema.parse(response)
      },
      complete: async (nodeId: string, commandId: string, result: unknown, exitCode?: number): Promise<Command> => {
        const response = await this.#request(`/nodes/${nodeId}/commands/${commandId}/complete`, { result, exitCode })
        return commandSchema.parse(response)
      },
      fail: async (nodeId: string, commandId: string, error: string, exitCode?: number): Promise<Command> => {
        const response = await this.#request(`/nodes/${nodeId}/commands/${commandId}/fail`, { error, exitCode })
        return commandSchema.parse(response)
      }
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

  mcpServers = {
    list: async (): Promise<McpServer[]> => {
      const response = await this.#request<ListMcpServersResponse>("/admin/mcp-servers")
      return z.array(mcpServerSchema).parse(response.mcpServers)
    },
    create: async (payload: CreateMcpServerRequest): Promise<McpServer> => {
      const response = await this.#request("/admin/mcp-servers", payload)
      return mcpServerSchema.parse(response)
    },
    update: async (id: string, payload: UpdateMcpServerRequest): Promise<McpServer> => {
      const response = await this.#request(`/admin/mcp-servers/${id}`, payload, { method: "PATCH" })
      return mcpServerSchema.parse(response)
    },
    delete: async (id: string): Promise<{ success: boolean }> => {
      return this.#request(`/admin/mcp-servers/${id}`, undefined, { method: "DELETE" })
    }
  }

  providers = {
    list: async (): Promise<Provider[]> => {
      const response = await this.#request<ListProvidersResponse>("/admin/providers")
      return z.array(providerSchema).parse(response.providers)
    },
    create: async (payload: CreateProviderRequest): Promise<Provider> => {
      const response = await this.#request("/admin/providers", payload)
      return providerSchema.parse(response)
    },
    update: async (id: string, payload: UpdateProviderRequest): Promise<Provider> => {
      const response = await this.#request(`/admin/providers/${id}`, payload, { method: "PATCH" })
      return providerSchema.parse(response)
    },
    delete: async (id: string): Promise<{ success: boolean }> => {
      return this.#request(`/admin/providers/${id}`, undefined, { method: "DELETE" })
    }
  }

  models = {
    list: async (): Promise<Model[]> => {
      const response = await this.#request<ListModelsResponse>("/admin/models")
      return z.array(modelSchema).parse(response.models)
    },
    create: async (payload: CreateModelRequest): Promise<Model> => {
      const response = await this.#request("/admin/models", payload)
      return modelSchema.parse(response)
    },
    update: async (id: string, payload: UpdateModelRequest): Promise<Model> => {
      const response = await this.#request(`/admin/models/${id}`, payload, { method: "PATCH" })
      return modelSchema.parse(response)
    },
    delete: async (id: string): Promise<{ success: boolean }> => {
      return this.#request(`/admin/models/${id}`, undefined, { method: "DELETE" })
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
