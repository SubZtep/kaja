import { createFileRoute } from "@tanstack/react-router"

/** Proxied Umami collect endpoint — pairs with data-host-url="/" on the tracker. */
const UMAMI_COLLECT_URL = "https://cloud.umami.is/api/send"

const FORWARD_HEADERS = [
  "content-type",
  "user-agent",
  "x-umami-website-id",
  "x-umami-hostname",
  "x-umami-cache",
  "x-forwarded-for",
  "x-real-ip",
  "cf-connecting-ip"
] as const

export const Route = createFileRoute("/api/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const headers = new Headers()
          for (const name of FORWARD_HEADERS) {
            const value = request.headers.get(name)
            if (value) headers.set(name, value)
          }

          // Prefer client IP from the reverse proxy when present
          if (!headers.has("x-forwarded-for")) {
            const ip = request.headers.get("x-real-ip") ?? request.headers.get("cf-connecting-ip")
            if (ip) headers.set("x-forwarded-for", ip)
          }

          const body = await request.arrayBuffer()
          const res = await fetch(UMAMI_COLLECT_URL, {
            method: "POST",
            headers,
            body
          })

          const resBody = await res.arrayBuffer()
          const contentType = res.headers.get("content-type") ?? "application/json"

          return new Response(resBody, {
            status: res.status,
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "no-store"
            }
          })
        } catch {
          return new Response(JSON.stringify({ error: "Proxy failed" }), {
            status: 502,
            headers: { "Content-Type": "application/json" }
          })
        }
      }
    }
  }
})
