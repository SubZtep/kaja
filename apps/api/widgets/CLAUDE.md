# Widget bundle

Embeddable vanilla-JS chat bundle, built as part of `@kaja/api`. Site owners paste a single `<script src="https://api.kaja.io/widget/<widget-key>.js"></script>` tag, no data attributes. The widget key in the URL is also the auth for `POST /widget/turn`; `baseUrl` is derived from the script's own `src` origin.

## How it's served

`GET /widget/<widget-key>.js` (`apps/api/src/features/widget/index.ts`) serves `apps/api/public/widget.js` if it exists. `bun run --filter @kaja/api build` writes it (`build:widget`), so production serves a prebuilt static bundle with no bundler at runtime.

If the file is missing (local dev, since `dev` doesn't prebuild it), the route bundles `widgets/src/index.ts` with `Bun.build()` on every request, uncached, so source edits show up without a restart. This fallback never runs in the packaged `server.js`.

The route resolves the key to its `config.widgetType` (`@kaja/schema/api`'s `widgetTypeSchema`, independent of `config.persona`) and prepends `window.__kajaWidgetMode=...`, so the script knows chat vs barkochba without a separate lookup.

## Layout

```
src/
  index.ts   # the embed script: renders bubble + panel, drives sendMessage
  client.ts  # sendWidgetTurn/createVisitorId, used only by index.ts
  i18n.ts    # strings from ../locales/*.toml (inlined), picked by the page's <html lang>, else the browser's
```

`apps/web`'s `barkochba-game.tsx` has its own inline copy of the fetch call: it behaves like a third-party page and doesn't import from this workspace.

## Conventions

- Talks only to `POST /widget/turn` on the script's own origin, authenticated by the widget key parsed from its own `src`
- State (`visitorId`, `session`) lives in `sessionStorage`, not cookies
- Framework-free and small, since it ships to third-party pages: no React, no build tooling beyond `bun build`
- A chat-mode turn that ends on a question with `options` (`offeredOptions` in `client.ts`) shows them as chips under the question; a click sends the option text as the answer, and any answer, a click or typed text, removes the chips. Barkochba mode keeps its own fixed answer buttons
- Request/response types come from `@kaja/schema/nasi` (`WidgetTurnRequest`, `NasiTurnResponse`); do not redefine them
