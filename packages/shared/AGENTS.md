# @kaja/shared

Pure shared utilities with no I/O and no app-specific business logic.

## Layout

```
index.ts               # getTimeAgo, getDateTime, getFirstName, capitalized, cn,
                        # isPublicHttpUrl, randomUUIDv7, titleCase — re-exports telegram-bot.ts, telegram-markdown.ts, locale.ts
telegram-markdown.ts    # renderTelegramHtml, splitTelegramMessage, truncateForStreaming, TELEGRAM_MESSAGE_LIMIT
telegram-bot.ts         # plumbing both Telegram bots (apps/tui, apps/api) share: escapeHtml, isCommand, EditThrottle, TelegramRateLimitError, grammy 429 / "not modified" helpers (matched by error shape: no grammy dependency)
locale.ts               # locales, Locale, LOCALE_LABELS — supported UI locale codes and display names
```

## Notable helpers

- **`cn(...inputs)`** — `clsx` + `tailwind-merge` for class names (web UI)
- **`getTimeAgo` / `getDateTime`** — locale-aware formatting via `Intl`
- **`isPublicHttpUrl`** — SSRF guard: rejects loopback/link-local/private/CGNAT hosts
- **`randomUUIDv7`** — time-ordered UUIDv7 generator
- **`titleCase`** — hyphen/underscore/space-separated label to Title Case
- **`locales` / `Locale` / `LOCALE_LABELS`** — supported UI locale codes (`en-GB`, `hu-HU`, `nan-TW`, `zh-TW`) and their native display names

## Conventions

- Keep functions pure and dependency-light
- Prefer adding here only when **two or more** workspaces need the same helper
- Match existing export style (named exports, short JSDoc)

## Boundaries

- No React components, no Zod schemas (use `@kaja/schema`), no logging, no fetch
- Do not import from `apps/*`
