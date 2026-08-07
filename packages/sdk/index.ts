import { error } from "@kaja/logger"
import type {
  CreateMcpServerRequest,
  CreateModelRequest,
  CreateProviderRequest,
  ListMcpServersResponse,
  ListModelsResponse,
  ListProvidersResponse,
  McpServer,
  Model,
  Provider,
  UpdateMcpServerRequest,
  UpdateModelRequest,
  UpdateProviderRequest
} from "@kaja/schema/api"
import { mcpServerSchema, modelSchema, providerSchema } from "@kaja/schema/api"
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
