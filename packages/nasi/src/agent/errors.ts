// The turn failures a host answers differently from a crash (a 404, a 409, a 502...). Each keeps the `name` hosts matched on before these were classes.

/** The turn named a session that doesn't exist, or one another owner in the same store holds. */
export class SessionNotFoundError extends Error {
  override name = "NasiSessionNotFound"
  constructor() {
    super("session_not_found")
  }
}

/** An `approval` came with no tool call waiting for one. */
export class NothingToApproveError extends Error {
  override name = "NasiNothingToApprove"
  constructor() {
    super("nothing_to_approve")
  }
}

/** The host found no model to run the turn with. */
export class NoModelError extends Error {
  override name = "NasiNoModel"
  constructor() {
    super("no_model")
  }
}

/** The model provider refused or failed the request; `contextOverflow` lets run() compact and retry first. */
export class ModelUnavailableError extends Error {
  override name = "NasiModelUnavailable"
  readonly contextOverflow: boolean
  constructor(message: string, opts: { contextOverflow: boolean; cause: unknown }) {
    super(`Model provider request failed: ${message}`, { cause: opts.cause })
    this.contextOverflow = opts.contextOverflow
  }
}
