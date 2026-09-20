import { TuiEnvSchema } from "@kaja/schema/env"

const DEFAULT_API_BASE_URL = "https://api.kaja.io"

/** Resolves the cloud API base URL: KAJA_API_URL env → the default cloud API. Used by both `kaja --cloud` and `kaja config fetch`. */
export function getApiBaseUrl(): string {
  return TuiEnvSchema.shape.KAJA_API_URL.safeParse(process.env.KAJA_API_URL).data ?? DEFAULT_API_BASE_URL
}
