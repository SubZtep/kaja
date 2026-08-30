import { join } from "node:path"
import * as z from "zod"
import { getPaths } from "../paths"

const CredentialsSchema = z.object({
  apiUrl: z.string(),
  token: z.string()
})

export type Credentials = z.infer<typeof CredentialsSchema>

function credentialsPath(): string {
  return join(getPaths().config, "credentials.json")
}

/** Loads the stored lite-CLI bearer token, if any. Never throws — a missing or corrupt file just means "not logged in". */
export async function loadCredentials(): Promise<Credentials | undefined> {
  try {
    const raw = await Bun.file(credentialsPath()).json()
    const parsed = CredentialsSchema.safeParse(raw)
    return parsed.success ? parsed.data : undefined
  } catch {
    return undefined
  }
}

/** Persists the lite-CLI bearer token at 0o600 — this file is a bearer credential, not provider config, so it does not live in secrets.toml. */
export async function saveCredentials(credentials: Credentials): Promise<void> {
  const { chmod, mkdir } = await import("node:fs/promises")
  await mkdir(getPaths().config, { recursive: true })
  const path = credentialsPath()
  await Bun.write(path, JSON.stringify(credentials, null, 2))
  await chmod(path, 0o600)
}

export async function clearCredentials(): Promise<void> {
  await Bun.file(credentialsPath())
    .delete()
    .catch(() => {})
}
