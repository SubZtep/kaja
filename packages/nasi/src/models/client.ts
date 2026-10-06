import OpenAI from "openai"

/** Free-chat proxy sets this to the model it resolved and put in the request. */
export const KAJA_MODEL_HEADER = "x-kaja-model"

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
  /** Replaces global `fetch`. The cloud passes a guarded fetch; the TUI leaves this unset so a model on the local network still works. */
  fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}): OpenAI {
  return new OpenAI({
    apiKey: opts.apiKey,
    baseURL: opts.baseURL,
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers)
      for (const [key, value] of Object.entries(opts.headers ?? {})) headers.set(key, value)
      // Global fetch is looked up per request, not when the client is made
      const res = await (opts.fetch ?? fetch)(input, { ...init, headers })
      const served = res.headers.get(KAJA_MODEL_HEADER)
      if (served) noteServedModel(served)
      return res
    }
  })
}
