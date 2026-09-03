import type { NasiTurnResponse, WidgetTurnRequest } from "@kaja/schema/nasi"

/** Generates a random visitor id. Callers own persisting/reusing it across turns. */
export function createVisitorId(): string {
  return crypto.randomUUID() // FIXME: UUIDv7
}

export class WidgetTurnRateLimitError extends Error {}

/** POSTs one turn to `/widget/turn`. Throws {@link WidgetTurnRateLimitError} on 429, otherwise a plain `Error`. */
export async function sendWidgetTurn(
  baseUrl: string,
  widgetKey: string,
  body: WidgetTurnRequest
): Promise<NasiTurnResponse> {
  const res = await fetch(`${baseUrl}/widget/turn`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-kaja-widget-key": widgetKey },
    body: JSON.stringify(body)
  })
  if (res.status === 429) throw new WidgetTurnRateLimitError("Too many messages — please wait a moment.")
  if (!res.ok) {
    const errorBody = await res.json().catch(() => undefined)
    throw new Error(typeof errorBody?.error === "string" ? errorBody.error : `Request failed: ${res.status}`)
  }
  return res.json()
}
