# @kaja/shared

Pure utilities shared by two or more workspaces: no I/O, business logic, React, Zod, logging, fetch or `apps/*` imports.

- One subpath per category (`@kaja/shared/<category>`, a folder with `index.ts`); a new one needs a `package.json` `exports` entry
- `net`'s `isPrivateAddress`/`isPublicHttpUrl` are the one SSRF rule (the API's fetch guard and the sandbox's egress proxy); an unparseable IPv6 counts as private
- `locale` is the one list of supported languages (`en-GB` is source and fallback); settings, web URLs and `bun sync:locales` derive from it
- `telegram` is both bots' shared plumbing; each passes in its own sender, translations and logger. Grammy errors are matched by shape to keep grammy out of the dependencies
