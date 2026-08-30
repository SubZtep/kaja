import { type NasiTurnRequest, NasiTurnRequestSchema, type NasiTurnResponse } from "@kaja/schema/nasi"

export type NasiClientOptions = {
  baseUrl: string
  getToken: () => Promise<string | undefined>
}

/**
 * HTTP client for hosted Nasi (`POST /nasi/turn`). Used by the lite CLI.
 * This module must not import sqlite or the agent loop.
 */
export function createNasiClient(opts: NasiClientOptions) {
  async function headers(): Promise<HeadersInit> {
    const token = await opts.getToken()
    return {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    }
  }

  return {
    async turn(body: NasiTurnRequest): Promise<NasiTurnResponse> {
      const parsed = NasiTurnRequestSchema.parse(body)
      const res = await fetch(new URL("/nasi/turn", opts.baseUrl), {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify(parsed)
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Nasi turn failed: ${res.status} ${text}`)
      }
      return res.json()
    }
  }
}
