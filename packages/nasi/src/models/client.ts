import OpenAI from "openai"

/** Free hosted chat tier (no provider needed); "auto" model lets the proxy pick server-side. */
export const FREE_CHAT_BASE_URL = "https://openai.kaja.io"
export const FREE_CHAT_API_KEY = "kaja"
export const FREE_CHAT_MODEL_ID = "auto"
export const FREE_CHAT_PROVIDER = "kaja"

/** Free-chat proxy sets this to the model it resolved and put in the request. */
export const KAJA_MODEL_HEADER = "x-kaja-model"

/** Forwarded to the free-chat proxy: use this key instead of its DB-sourced provider key. */
export const KAJA_ZEN_KEY_HEADER = "x-kaja-zen-key"

/**
 * Last model id reported by a free-chat proxy via {@link KAJA_MODEL_HEADER}.
 * Filled as soon as response headers arrive (before the stream body).
 */
let lastServedModel: string | undefined

/** Record a served model id (free-chat proxy header, or tests). */
export function noteServedModel(model: string) {
  lastServedModel = model
}

/** Take (and clear) the model id from the most recent free-chat response, if any. */
export function takeLastServedModel(): string | undefined {
  const model = lastServedModel
  lastServedModel = undefined
  return model
}

/**
 * OpenAI client that records `x-kaja-model` from free-chat proxy responses.
 * Used for the default chat client and for mid-session model switches.
 */
export function createOpenAIClient(opts: {
  baseURL: string
  apiKey: string
  headers?: Record<string, string>
}): OpenAI {
  return new OpenAI({
    apiKey: opts.apiKey,
    baseURL: opts.baseURL,
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers)
      for (const [key, value] of Object.entries(opts.headers ?? {})) headers.set(key, value)
      const res = await fetch(input, { ...init, headers })
      const served = res.headers.get(KAJA_MODEL_HEADER)
      if (served) noteServedModel(served)
      return res
    }
  })
}
