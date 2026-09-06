# Widget bundle

Embeddable vanilla-JS chat bundle, built as part of `@kaja/api`. Site owners paste a single `<script src="https://api.kaja.io/widget/<widget-key>.js"></script>` tag — no data attributes. The widget key in the URL is also the auth for `POST /widget/turn`; no framework, no custom elements — plain DOM. `baseUrl` is derived from the script's own `src` origin.

## Commands

```bash
bun run --filter @kaja/api dev:widget    # watch-builds straight into apps/api/public/widget.js
bun run --filter @kaja/api build:widget  # same output, minified (also runs as part of `build`)
```

Output goes directly to `apps/api/public/widget.js`, served (same bundle for every key) at `GET /widget/<widget-key>.js` — the route resolves the key to its `config.widgetType` (`@kaja/schema/api`'s `widgetTypeSchema`, independent of `config.persona`) and prepends `window.__kajaWidgetMode=...` to the response so the script knows chat vs barkochba without a separate lookup (see `apps/api/src/features/widget/index.ts`).

## Layout

```
src/
  index.ts   # the embed script: renders bubble + panel, drives sendMessage
  client.ts  # sendWidgetTurn/createVisitorId, used only by index.ts
             # (apps/web's barkochba-game.tsx has its own inline copy of the fetch call — it behaves
             # like a third-party page and doesn't import from this workspace)
```

## Conventions

- Talks only to `POST /widget/turn` on the script's own origin, authenticated via the widget key parsed out of its own `src`
- State (`visitorId`, `session`) persisted in `sessionStorage`, not cookies
- Keep the bundle framework-free and small — it ships to third-party pages

## Boundaries

- No React, no build tooling beyond `bun build`
- Request/response types come from `@kaja/schema/nasi` (`WidgetTurnRequest`, `NasiTurnResponse`) — do not redefine them here
