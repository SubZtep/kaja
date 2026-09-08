const SECRETS_SERVICE = "kaja-cli"

/** Thrown when the OS credential store itself is unreachable (e.g. no secret-service daemon on Linux) — distinct from "no token stored". */
export class SecretsAccessError extends Error {
  constructor(cause: unknown) {
    super("Could not access the system credential store", { cause })
  }
}

/** Loads the stored lite-CLI bearer token for `email` from the OS credential store, if any. Keyed by user, not apiUrl, so multiple accounts can coexist on one machine. */
export async function loadToken(email: string): Promise<string | undefined> {
  try {
    const value = await Bun.secrets.get({ service: SECRETS_SERVICE, name: email })
    return value ?? undefined
  } catch (error) {
    throw new SecretsAccessError(error)
  }
}

/** Persists the lite-CLI bearer token for `email` in the OS credential store (Keychain / Credential Manager / secret-service). */
export async function saveToken(email: string, token: string): Promise<void> {
  try {
    await Bun.secrets.set({ service: SECRETS_SERVICE, name: email, value: token })
  } catch (error) {
    throw new SecretsAccessError(error)
  }
}

export async function clearToken(email: string): Promise<void> {
  try {
    await Bun.secrets.delete({ service: SECRETS_SERVICE, name: email })
  } catch (error) {
    throw new SecretsAccessError(error)
  }
}
