# @kaja/shared

Pure shared utilities with no I/O and no app-specific business logic.

## Layout

One subpath per category (`@kaja/shared/<category>`), each a folder with an `index.ts`; there is no bare `@kaja/shared` import. A new subpath needs an entry in `package.json` `exports`.

```
date/        # getTimeAgo, getDateTime: locale-aware formatting via Intl
text/        # name/title helpers, formatDeviceUserCode, modelSlug/uniqueModelSlug (the `[models.<id>]` id the wizard derives), trimTrailingSlashes, sessionTitle
ui/          # cn (clsx + tailwind-merge)
net/         # isPrivateAddress, isPublicHttpUrl: SSRF guard
id/          # randomUUIDv7
locale/      # locales, baseLocale, LOCALE_LABELS, matchLocale, flattenMessages, formatMessage ({param} interpolation), createMessages
toml/        # stringifyToml, groupTomlTables: every TOML file Kaja writes groups sub-tables under their parent's header (API and TUI)
telegram/    # plumbing both Telegram bots (apps/tui, apps/api) share
  bot.ts       # escapeHtml, isCommand, EditThrottle, TelegramRateLimitError, grammy 429 / "not modified" helpers (matched by error shape: no grammy dependency), approvalToken (a call id's hash for callback data), albumCollector (an album's photos as one turn)
  markdown.ts  # renderTelegramHtml, splitTelegramMessage and truncateForStreaming (both close and reopen the tags a cut falls inside, never cut a tag or entity), TELEGRAM_MESSAGE_LIMIT
  reply.ts     # openReply (a turn's "…" placeholder: throttled streamed edits sent one at a time, a failed one not counted as sent; endRound keeps a tool-calling round's text as its own message; finish with chunks and photos; settle before an approval, removing an untouched placeholder; fail), compactedLine; each bot passes its sender, photo rule, translations and logger
```

## Notable behaviour

- **`isPrivateAddress` / `isPublicHttpUrl`** reject loopback/link-local/private/CGNAT addresses and IPv6 forms that carry one (mapped, translated, compatible, NAT64, 6to4); an unparseable IPv6 counts as private. The API's fetch guard and the sandbox's egress proxy share it
- **`locales` / `baseLocale` / `LOCALE_LABELS` / `matchLocale`** are the one list of supported languages (`en-GB` is the source and fallback). Everything derives from it: the settings schema, the web's URL patterns, and `bun sync:locales` (which creates a new language's files and updates the inlang settings)

## Conventions

- Pure and dependency-light; add a helper here only when **two or more** workspaces need it
- Named exports, short JSDoc
- No React components, no Zod schemas (use `@kaja/schema`), no logging, no fetch; do not import from `apps/*`
