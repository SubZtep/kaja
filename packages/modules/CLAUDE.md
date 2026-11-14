# @kaja/modules

Modules: features with their own tables, agent tools and background jobs (later: messages, pages), where an ability only adds tools. First-party code compiled into the hosts, never fetched; the marketplace stays data-only. Only the API loads modules so far.

- A module is a folder under `src/`: `manifest.ts` (`defineManifest`: id and DDL, importing nothing heavy) and `module.ts` (`defineModule`: the manifest plus code). Add it to both lists, `manifest.ts`'s `manifests` and `registry.ts`'s `modules`; a test keeps them in step
- `@kaja/modules/manifest` is for callers that must not pull in the tool stack: the API's migrate script, and the TUI (`MODULE_IDS`)
- The id is also the ability a persona lists to get the module's tools (`moduleToolGroups` sources them `ability:<id>`, official, so their names are reserved), and the prefix of its tables
- A module imports nothing from another module, and from hosts only what `ModuleContext` hands it
- SQL follows nasi's store rules: the dialect Postgres and SQLite share, values through nasi's codecs (`iso`, `pgText`), writes in `sql.begin`. Scope every statement by `userId`, never by a channel's `owner`: an account's web, Telegram and terminal chats share a module's rows
- DDL is Postgres for now, a string in the module's `schema.ts`, edited in place until v1.0 like the API's migrations
- Web requests go through `ctx.send` (the cloud: the turn's sandbox), never a bare `fetch`
- Tool results are English text for the model, so they need no locale keys; never log article text or URLs
- The module system's own tables (`core/schema.ts`, migrations named `modules/core/…`) apply before any module's; `core` can't be a module id
- Per-account settings: `moduleSettings(ctx, id, schema)` over `module_user`, a zod object whose every field has a default; the row appears with the first `set`. Read them in the tool, not into the prompt, so a change applies in a running conversation
- A module's model calls use `ctx.model` and report through the tool context's `onModelCall`, so the session's usage counts them; a failed call is a `warn` and a skipped step, never a failed tool
- `prompt` is a static system prompt section tied to one of the module's tools; nasi shows it only to a persona that has that tool

## Jobs

- `jobs` are run by `createJobRunner` (`core/jobs.ts`) from `module_job` rows; the host ticks it every minute. It is host-neutral and for one process: two runs at a time, five minutes each, a failed run retried after `RETRY_MINUTES` and then at its regular time
- A `global` job has one row, made by the runner. Its `send` connects from the host, so the job names its `hosts` and reaches nothing else; use it only for a list that is the same for everyone
- A `user` job has a row per account, made by `scheduleJob` when the module sees work for the account (reading: a topic is followed). `run` answers `"done"` when there is none left, and the row goes. There is no scan for accounts
- A user job gets what a turn's tools get plus `onModelCall`; report every model call through it (`module_model_call`)
- A job's error message is stored and reported: no article text or URLs in it. A step that may fail for one item (a page) is caught inside the job; throwing is for "try the whole run again"
- `disabledModules`/`setModuleEnabled` (`module_state`) are the host's server-wide switch; the host leaves a disabled module out of everything it asks the registry and the runner

## reading

- `assignTopics` (`reading/tagging.ts`) is the one place an article's topics are decided; `save_article` calls it, an untagged article (`tagged_at` NULL) is tagged on its next save
- Topic names match by `topicKey` (case, width and spacing aside); a neutral topic left without articles is deleted, followed and muted ones stay
- The follow offer is a line in the save result at `FOLLOW_OFFER_AT` articles, once per topic (`offered_at`; a state set by hand counts too)
- A message that is only a link goes to `link_received`, which reads the account's `bareLinks` setting each time
- A `Source` (`reading/sources.ts`; Hacker News is the first) lists stories for everyone: the `collect` job keeps them in `reading_source_item` for a week
- `discover` (`reading/discover.ts`) is the one place suggestions are made, for the daily `discover` job and `find_articles` alike: the candidates first seen since the account's `discoveredAt`, one model call to pick, at most `DAILY_CAP` found per 24 hours. It throws when the picking call fails
- A found story is a `reading_article` with status `suggested` and its source; it never creates a topic and doesn't count in a topic's articles. Keeping, reading or saving it moves it to the inbox; untouched, `collect` deletes it after `SUGGESTION_DAYS`
