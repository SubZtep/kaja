const SECRETS_SERVICE = "kaja-tui"
const SECRETS_NAME = "token"

/** Thrown when the OS credential store itself is unreachable (e.g. no secret-service daemon on Linux) — distinct from "no token stored". */
export class SecretsAccessError extends Error {
  constructor(cause: unknown) {
    super("Could not access the system credential store", { cause })
  }
}

/** Loads the stored hosted (--remote) bearer token from the OS credential store, if any. */
export async function loadToken(): Promise<string | undefined> {
  try {
    const value = await Bun.secrets.get({ service: SECRETS_SERVICE, name: SECRETS_NAME })
    return value ?? undefined
  } catch (error) {
    throw new SecretsAccessError(error)
  }
}

/** Persists the hosted (--remote) bearer token in the OS credential store (Keychain / Credential Manager / secret-service). */
export async function saveToken(token: string): Promise<void> {
  try {
    await Bun.secrets.set({ service: SECRETS_SERVICE, name: SECRETS_NAME, value: token })
  } catch (error) {
    throw new SecretsAccessError(error)
  }
}

export async function clearToken(): Promise<void> {
  try {
    await Bun.secrets.delete({ service: SECRETS_SERVICE, name: SECRETS_NAME })
  } catch (error) {
    throw new SecretsAccessError(error)
  }
}
