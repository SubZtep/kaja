# @kaja/shared

Pure shared utilities with no I/O and no app-specific business logic.

## Layout

One subpath per category (`@kaja/shared/<category>`), each a folder with an `index.ts`; there is no bare `@kaja/shared` import.

```
date/        # getTimeAgo, getDateTime — locale-aware formatting via Intl
text/        # getFirstName, getDisplayName, capitalized, titleCase, formatDeviceUserCode, modelSlug, uniqueModelSlug, trimTrailingSlashes, withQuestion
ui/          # cn (clsx + tailwind-merge)
net/         # isPrivateAddress, isPublicHttpUrl — SSRF guard
id/          # randomUUIDv7
locale/      # locales, Locale, LOCALE_LABELS, matchLocale — supported UI locale codes, display names, tag matching
sandbox/     # signSandboxToken, verifySandboxToken, SANDBOX_STATS_SCOPE — HMAC bearer tokens the API signs and the MCP sandbox checks (Web Crypto)
telegram/    # plumbing both Telegram bots (apps/tui, apps/api) share
  bot.ts       # escapeHtml, isCommand, EditThrottle, TelegramRateLimitError, grammy 429 / "not modified" helpers (matched by error shape: no grammy dependency)
  markdown.ts  # renderTelegramHtml, splitTelegramMessage, truncateForStreaming, TELEGRAM_MESSAGE_LIMIT
```

A new subpath needs an entry in `package.json` `exports`.

## Notable helpers

- **`cn(...inputs)`** — `clsx` + `tailwind-merge` for class names (web UI)
- **`getTimeAgo` / `getDateTime`** — locale-aware formatting via `Intl`
- **`isPrivateAddress` / `isPublicHttpUrl`** — SSRF guard: rejects loopback/link-local/private/CGNAT addresses (the API's fetch guard and the sandbox's egress proxy share it)
- **`randomUUIDv7`** — time-ordered UUIDv7 generator
- **`titleCase`** — hyphen/underscore/space-separated label to Title Case
- **`locales` / `Locale` / `LOCALE_LABELS` / `matchLocale`** — supported UI locale codes (`en-GB`, `en-US`, `hu-HU`, `nan-TW`, `zh-TW`), their native display names, and matching any language tag to one
- **`modelSlug` / `uniqueModelSlug`** — the `[models.<id>]` id the wizard derives from a provider's model name

## Conventions

- Keep functions pure and dependency-light
- Prefer adding here only when **two or more** workspaces need the same helper
- Match existing export style (named exports, short JSDoc)

## Boundaries

- No React components, no Zod schemas (use `@kaja/schema`), no logging, no fetch (`sandbox/` uses Web Crypto, which is fine)
- Do not import from `apps/*`
