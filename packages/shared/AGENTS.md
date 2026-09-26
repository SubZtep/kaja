# @kaja/shared

Pure shared utilities with no I/O and no app-specific business logic.

## Layout

```
index.ts               # getTimeAgo, getDateTime, getFirstName, getDisplayName, capitalized, cn, isPrivateAddress,
                        # isPublicHttpUrl, randomUUIDv7, formatDeviceUserCode, titleCase, modelSlug, uniqueModelSlug,
                        # trimTrailingSlashes, withQuestion — re-exports telegram-bot.ts, telegram-markdown.ts, locale.ts, sandbox-token.ts
telegram-markdown.ts    # renderTelegramHtml, splitTelegramMessage, truncateForStreaming, TELEGRAM_MESSAGE_LIMIT
telegram-bot.ts         # plumbing both Telegram bots (apps/tui, apps/api) share: escapeHtml, isCommand, EditThrottle, TelegramRateLimitError, grammy 429 / "not modified" helpers (matched by error shape: no grammy dependency)
sandbox-token.ts        # signSandboxToken, verifySandboxToken — HMAC bearer tokens the API signs and the MCP sandbox checks (Web Crypto)
locale.ts               # locales, Locale, LOCALE_LABELS, matchLocale — supported UI locale codes, display names, tag matching
```

## Notable helpers

- **`cn(...inputs)`** — `clsx` + `tailwind-merge` for class names (web UI)
- **`getTimeAgo` / `getDateTime`** — locale-aware formatting via `Intl`
- **`isPrivateAddress` / `isPublicHttpUrl`** — SSRF guard: rejects loopback/link-local/private/CGNAT addresses (the API's fetch guard and the sandbox's egress proxy share it)
- **`randomUUIDv7`** — time-ordered UUIDv7 generator
- **`titleCase`** — hyphen/underscore/space-separated label to Title Case
- **`locales` / `Locale` / `LOCALE_LABELS` / `matchLocale`** — supported UI locale codes (`en-GB`, `hu-HU`, `nan-TW`, `zh-TW`), their native display names, and matching any language tag to one
- **`modelSlug` / `uniqueModelSlug`** — the `[models.<id>]` id the wizard derives from a provider's model name

## Conventions

- Keep functions pure and dependency-light
- Prefer adding here only when **two or more** workspaces need the same helper
- Match existing export style (named exports, short JSDoc)

## Boundaries

- No React components, no Zod schemas (use `@kaja/schema`), no logging, no fetch (`sandbox-token.ts` uses Web Crypto, which is fine)
- Do not import from `apps/*`
