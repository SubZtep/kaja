import { cors } from "hono/cors"

/**
 * CORS for /widget/* only — reflects any Origin. Safe because this flow carries no cookies/
 * credentials (auth is the `X-Kaja-Widget-Key` header, checked by widgetKeyAuthMiddleware), so
 * there's no ambient-authority/CSRF risk the way there would be with `credentials: true`. The
 * app-wide fixed-single-origin `cors()` in app.ts cannot work here since a widget can be embedded
 * on any third-party site — this middleware replaces it for this path, not adds to it.
 */
export const widgetCors = cors({
  origin: origin => origin,
  allowMethods: ["POST", "OPTIONS"],
  allowHeaders: ["content-type", "x-kaja-widget-key"]
})
