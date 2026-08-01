# @kaja/shared

Pure shared utilities with no I/O and no app-specific business logic.

## Layout

```
index.ts    # getTimeAgo, getDateTime, getFirstName, capitalized, cn, isImageUrl, isItTrue
```

## Notable helpers

- **`cn(...inputs)`** — `clsx` + `tailwind-merge` for class names (web UI)
- **`getTimeAgo` / `getDateTime`** — locale-aware formatting via `Intl`
- **`isImageUrl`** — pathname extension check
- **`isItTrue`** — loose boolean parse from strings (`true`/`1`/`on`/`y…`)

## Conventions

- Keep functions pure and dependency-light
- Prefer adding here only when **two or more** workspaces need the same helper
- Match existing export style (named exports, short JSDoc)

## Boundaries

- No React components, no Zod schemas (use `@kaja/schema`), no logging, no fetch
- Do not import from `apps/*`
