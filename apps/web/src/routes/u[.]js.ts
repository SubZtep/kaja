import { createFileRoute } from "@tanstack/react-router"

/** Proxied Umami tracker — same-origin path avoids ad-blocker domain lists. */
const UMAMI_SCRIPT_URL = "https://cloud.umami.is/script.js"

export const Route = createFileRoute("/u.js")({
  server: {
    handlers: {
      GET: async () => {
        try {
          const res = await fetch(UMAMI_SCRIPT_URL)
          if (!res.ok) {
            return new Response("Failed to load tracker", { status: 502 })
          }

          const body = await res.text()
          return new Response(body, {
            headers: {
              "Content-Type": "application/javascript; charset=utf-8",
              "Cache-Control": "public, max-age=86400",
              "X-Content-Type-Options": "nosniff"
            }
          })
        } catch {
          return new Response("Failed to load tracker", { status: 502 })
        }
      }
    }
  }
})
