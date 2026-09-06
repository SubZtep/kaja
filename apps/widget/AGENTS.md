# @kaja/widget

Embeddable vanilla-JS chat bundle. Site owners paste a single `<script src="https://api.kaja.io/widget/<widget-key>.js"></script>` tag — no data attributes. The widget key in the URL is also the auth for `POST /widget/turn`; no framework, no custom elements — plain DOM. `baseUrl` is derived from the script's own `src` origin.

## Commands

```bash
bun run --filter @kaja/widget dev    # watch-builds straight into ../api/public/widget.js
bun run --filter @kaja/widget build  # dist/widget.js (minified IIFE)
```

`apps/api/Dockerfile` builds this package and copies `dist/widget.js` into `apps/api/public/widget.js`, served (same bundle for every key) at `GET /widget/<widget-key>.js` — the route resolves the key to its `config.widgetType` (`@kaja/schema/api`'s `widgetTypeSchema`, independent of `config.persona`) and prepends `window.__kajaWidgetMode=...` to the response so the script knows chat vs barkochba without a separate lookup (see `apps/api/src/features/widget/index.ts`).

## Layout

```
src/
  index.ts   # the embed script: renders bubble + panel, drives sendMessage
  client.ts  # sendWidgetTurn/createVisitorId — also imported directly as @kaja/widget/client
             # by apps/web (hero.tsx injects the script tag, barkochba-game.tsx calls the client)
```

## Conventions

- Talks only to `POST /widget/turn` on the script's own origin, authenticated via the widget key parsed out of its own `src`
- State (`visitorId`, `session`) persisted in `sessionStorage`, not cookies
- Keep the bundle framework-free and small — it ships to third-party pages

## Boundaries

- No React, no build tooling beyond `bun build`
- Request/response types come from `@kaja/schema/nasi` (`WidgetTurnRequest`, `NasiTurnResponse`) — do not redefine them here
