# @kaja/modules

Modules: features with their own tables and agent tools (later: jobs, messages, pages), where an ability only adds tools. First-party code compiled into the hosts, never fetched; the marketplace stays data-only. Only the API loads modules so far.

- A module is a folder under `src/`: `manifest.ts` (`defineManifest`: id and DDL, importing nothing heavy) and `module.ts` (`defineModule`: the manifest plus code). Add it to both lists, `manifest.ts`'s `manifests` and `registry.ts`'s `modules`; a test keeps them in step
- `@kaja/modules/manifest` is for callers that must not pull in the tool stack: the API's migrate script, and the TUI (`MODULE_IDS`)
- The id is also the ability a persona lists to get the module's tools (`moduleToolGroups` sources them `ability:<id>`, official, so their names are reserved), and the prefix of its tables
- A module imports nothing from another module, and from hosts only what `ModuleContext` hands it
- SQL follows nasi's store rules: the dialect Postgres and SQLite share, values through nasi's codecs (`iso`, `pgText`), writes in `sql.begin`. Scope every statement by `userId`, never by a channel's `owner`: an account's web, Telegram and terminal chats share a module's rows
- DDL is Postgres for now, a string in the module's `schema.ts`, edited in place until v1.0 like the API's migrations
- Web requests go through `ctx.send` (the cloud: the turn's sandbox), never a bare `fetch`
- Tool results are English text for the model, so they need no locale keys; never log article text or URLs
