import { captureException } from "@sentry/tanstackstart-react"
import { createServerFn } from "@tanstack/react-start"
import { getCookie, setCookie } from "@tanstack/react-start/server"
import { z } from "zod"
import { env } from "../../env/server"
import { barkochbaActionSchema, type BarkochbaResponse, handleBarkochba } from "./game"

export type { BarkochbaResponse } from "./game"

const COOKIE = "kaja_barkochba"

function visitorId(create: boolean): string | undefined {
  const existing = getCookie(COOKIE)
  if (existing && z.uuid().safeParse(existing).success) return existing
  if (!create) return undefined
  const id = crypto.randomUUID()
  setCookie(COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 })
  return id
}

function api(token: string, path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  headers.set("Authorization", `Bearer ${token}`)
  headers.set("Content-Type", "application/json")
  return fetch(new URL(path, env.API_URL || env.VITE_API_URL), { ...init, headers })
}

/** One homepage game action. Both widget tokens stay on this server. */
export const playBarkochba = createServerFn({ method: "POST" })
  .validator((input: unknown) => barkochbaActionSchema.parse(input))
  .handler(({ data }): Promise<BarkochbaResponse> =>
    handleBarkochba(data, {
      boardToken: env.BARKOCHBA_BOARD_TOKEN,
      playerToken: env.BARKOCHBA_PLAYER_TOKEN,
      visitorId,
      api,
      report: error => captureException(error)
    })
  )
