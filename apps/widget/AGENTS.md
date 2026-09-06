# @kaja/widget

Embeddable vanilla-JS chat bundle. Site owners paste a `<script data-kaja-key="..." data-kaja-base-url="..." data-kaja-mode="chat|barkochba">` tag; no framework, no custom elements — plain DOM.

## Commands

```bash
bun run --filter @kaja/widget dev    # watch-builds straight into ../api/public/widget.js
bun run --filter @kaja/widget build  # dist/widget.js (minified IIFE)
```

`apps/api/Dockerfile` builds this package and copies `dist/widget.js` into `apps/api/public/widget.js`, served at `GET /widget/widget.js` (see `apps/api/src/features/widget/index.ts`).

## Layout

```
src/
  index.ts   # the embed script: renders bubble + panel, drives sendMessage
  client.ts  # sendWidgetTurn/createVisitorId — also imported directly as @kaja/widget/client
             # by apps/web (hero.tsx injects the script tag, barkochba-game.tsx calls the client)
```

## Conventions

- Talks only to `POST /widget/turn` on the configured `baseUrl`, authenticated via the widget key in the embed tag
- State (`visitorId`, `session`) persisted in `sessionStorage`, not cookies
- Keep the bundle framework-free and small — it ships to third-party pages

## Boundaries

- No React, no build tooling beyond `bun build`
- Request/response types come from `@kaja/schema/nasi` (`WidgetTurnRequest`, `NasiTurnResponse`) — do not redefine them here
