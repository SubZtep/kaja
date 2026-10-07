---
layout: page
title: Schema
parent: Development
nav_order: 7
summary: "Where every Zod schema lives."
---

# @kaja/schema

Every Zod schema in the project lives here, split into role-based subpaths that are each their own import.
There's no bare `@kaja/schema` import, and no app keeps local schema files. Fields carry a `.describe()`,
which also ends up in the generated JSON Schemas.

| Subpath | Contents | Files | Consumers |
|---|---|---|---|
| `@kaja/schema/api` | REST contracts: providers and models, widget keys, the ability catalog and users' keys, usage stats, sandboxes, the Telegram link, auth payloads, the config export bundle | `api/*.ts` | `apps/api`, `apps/web` |
| `@kaja/schema/nasi` | the HTTP turn contract: `NasiTurnRequest`, `WidgetTurnRequest`, `NasiTurnResponse` and its steps | `nasi/index.ts` | `apps/api`, `apps/tui`, `packages/nasi` |
| `@kaja/schema/abilities` | marketplace manifests: skill frontmatter, persona, dataset, HTTP tool, MCP server | `abilities/*.ts` | `apps/api`, `apps/tui`, `packages/nasi` |
| `@kaja/schema/config` | the CLI's hand-edited TOML files (`settings`, `models`, `mcp`, `secrets`, `abilities`) and `docs/config/catalog.toml`, the model catalog | `config/*.ts` | `apps/tui` |
| `@kaja/schema/store` | runtime state behind `NasiStore`: sessions and memory notes | `store/*.ts` | `apps/tui`, `packages/nasi` |
| `@kaja/schema/cli` | a re-export of the persona and dataset schemas, so CLI code keeps one import | `cli/index.ts` | `apps/tui` |
| `@kaja/schema/env` | env-var schemas, the source of every `.env.example` and `env.d.ts` | `env/*.ts` | build scripts |
| `@kaja/schema/tombi` | JSON Schema generation for the TOML files | `tombi/*.ts` | build scripts |

The last two feed generators and aren't imported at runtime: `bun generate:env`, `bun generate:env-types` and
`bun generate:schemas` read them. Naming conventions are in `packages/schema/CLAUDE.md`.

Dates are `z.coerce.date()` throughout, so JSON round-trips cleanly. Subpaths don't import each other's
types. Where one refers to another's concept, it does so by id: a persona's `models.<task>` pin is a
`models.toml` entry id, and a stored session's `persona` is a persona id.

The turn statuses and step types are on [Agent brain](/development/nasi#turn-statuses), and the tables behind
`store` are on [Database](/development/database).

## JSON Schemas for the TOML files

`bun generate:schemas` turns the `config` and `abilities` schemas into the JSON Schemas in
[`docs/config/schemas`](https://github.com/SubZtep/kaja/tree/main/docs/config/schemas). They give editors
completion and validation for `settings.toml`, `models.toml`, `mcp.toml`, `secrets.toml`, `abilities.toml`
and the marketplace manifests. The pre-commit hook regenerates them whenever those schemas change, so never
edit the JSON by hand.

---

Next:

[Marketplace internals](/development/marketplace){: .btn .btn-green .fs-5 }
