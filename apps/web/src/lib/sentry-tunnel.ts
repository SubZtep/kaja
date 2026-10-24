/** The browser's Sentry DSN; the server's sits in instrument.server.mjs. */
export const SENTRY_DSN = "https://96f4dd55ad041f9db78a1f9beadc1fac@o326475.ingest.us.sentry.io/4512040899444736"

/** Same-origin path the browser SDK posts its envelopes to, so ad blockers don't drop them on the way to Sentry. */
export const SENTRY_TUNNEL_PATH = "/t"

const dsn = new URL(SENTRY_DSN)
const projectId = dsn.pathname.slice(1)

/**
 * Forwards a Sentry envelope to our own project's ingest endpoint; anything addressed to another DSN gets a 400, so
 * the route can't relay to arbitrary hosts.
 */
export async function forwardSentryEnvelope(request: Request): Promise<Response> {
  const envelope = await request.bytes()
  const newline = envelope.indexOf(10)
  try {
    const header = JSON.parse(new TextDecoder().decode(newline === -1 ? envelope : envelope.subarray(0, newline)))
    const target = new URL(header.dsn)
    if (target.hostname !== dsn.hostname || target.pathname.slice(1) !== projectId) {
      return new Response("Invalid DSN", { status: 400 })
    }
  } catch {
    return new Response("Invalid envelope", { status: 400 })
  }
  const upstream = await fetch(`https://${dsn.hostname}/api/${projectId}/envelope/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-sentry-envelope" },
    body: envelope
  })
  return new Response(null, { status: upstream.status })
}
