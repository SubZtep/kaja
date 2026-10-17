/** A throwaway website on its own port, for pages that embed what Kaja ships (the widget). */
export type Site = { url: string; origin: string; setBody(html: string): void; stop(): Promise<void> }

export function startSite(): Site {
  let body = "<!doctype html><title>Site</title>"
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => new Response(body, { headers: { "content-type": "text/html" } })
  })
  const origin = `http://127.0.0.1:${server.port}`
  return {
    url: `${origin}/`,
    origin,
    setBody: html => {
      body = html
    },
    stop: async () => {
      await server.stop(true)
    }
  }
}
