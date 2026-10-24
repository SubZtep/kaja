# Widget bundle

Embeddable vanilla-JS chat, built with `@kaja/api`. Site owners paste one `<script src="https://api.kaja.io/widget/<widget-key>.js">` tag; the key is also the auth for `POST /widget/turn`, and `baseUrl` comes from the script's own origin.

- `GET /widget/<widget-key>.js` serves the prebuilt `apps/api/public/widget.js` (written by the API build). When it's missing (`dev` doesn't prebuild), the route runs `Bun.build()` on every request, uncached, so edits show without a restart
- The route prepends `window.__kajaWidgetMode=...` from the key's `config.widgetType` (independent of `config.persona`), so the script knows chat vs barkochba without a lookup
- It ships to third-party pages: framework-free and small, `bun build` only, state in `sessionStorage`, talks only to `POST /widget/turn`, types from `@kaja/schema/nasi`
- `apps/web`'s `barkochba-game.tsx` keeps its own inline copy of the fetch call on purpose: it acts as a third-party page
